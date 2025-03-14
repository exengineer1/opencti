# coding: utf-8


import base64
import ctypes
import datetime
import functools
import json
import os
import random
import sys
import threading
import time
import traceback
from dataclasses import dataclass, field
from threading import Thread
from typing import Any, Dict, List, Optional, Union

import pika
import yaml
from opentelemetry import metrics
from opentelemetry.exporter.prometheus import PrometheusMetricReader
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from pika.adapters.blocking_connection import BlockingChannel
from prometheus_client import start_http_server
from pycti import OpenCTIApiClient
from pycti.connector.opencti_connector_helper import (
    create_mq_ssl_context,
    get_config_variable,
)
from requests.exceptions import RequestException, Timeout

PROCESSING_COUNT: int = 4
MAX_PROCESSING_COUNT: int = 60

# Telemetry variables definition
meter = metrics.get_meter(__name__)
resource = Resource(attributes={SERVICE_NAME: "opencti-worker"})
bundles_global_counter = meter.create_counter(
    name="opencti_bundles_global_counter",
    description="number of bundles processed",
)
bundles_success_counter = meter.create_counter(
    name="opencti_bundles_success_counter",
    description="number of bundles successfully processed",
)
bundles_timeout_error_counter = meter.create_counter(
    name="opencti_bundles_timeout_error_counter",
    description="number of bundles in timeout error",
)
bundles_request_error_counter = meter.create_counter(
    name="opencti_bundles_request_error_counter",
    description="number of bundles in request error",
)
bundles_technical_error_counter = meter.create_counter(
    name="opencti_bundles_technical_error_counter",
    description="number of bundles in technical error",
)
bundles_lock_error_counter = meter.create_counter(
    name="opencti_bundles_lock_error_counter",
    description="number of bundles in lock error",
)
bundles_missing_reference_error_counter = meter.create_counter(
    name="opencti_bundles_missing_reference_error_counter",
    description="number of bundles in missing reference error",
)
bundles_bad_gateway_error_counter = meter.create_counter(
    name="opencti_bundles_bad_gateway_error_counter",
    description="number of bundles in bad gateway error",
)
bundles_processing_time_gauge = meter.create_histogram(
    name="opencti_bundles_processing_time_gauge",
    description="processing time of bundles",
)


class PingAlive(threading.Thread):
    def __init__(self, worker_logger, api) -> None:
        threading.Thread.__init__(self)
        self.worker_logger = worker_logger
        self.api = api
        self.exit_event = threading.Event()

    def ping(self) -> None:
        while not self.exit_event.is_set():
            try:
                self.worker_logger.debug("PingAlive running.")
                self.api.query(
                    """
                    query {
                      about {
                        version
                      }
                    }
                  """
                )
            except Exception as e:  # pylint: disable=broad-except
                self.in_error = True
                self.worker_logger.error(
                    "Error pinging the API",
                    {"reason": str(e), "headers": str(self.api.get_request_headers())},
                )
            self.exit_event.wait(30)

    def run(self) -> None:
        self.worker_logger.info("Starting PingAlive thread")
        self.ping()

    def stop(self) -> None:
        self.worker_logger.info("Preparing PingAlive for clean shutdown")
        self.exit_event.set()


@dataclass(unsafe_hash=True)
class Consumer(Thread):  # pylint: disable=too-many-instance-attributes
    connector: Dict[str, Any] = field(hash=False)
    config: Dict[str, Any] = field(hash=False)
    opencti_url: str
    opencti_token: str
    log_level: str
    ssl_verify: Union[bool, str] = False
    json_logging: bool = False

    def __post_init__(self) -> None:
        super().__init__()
        self.api = OpenCTIApiClient(
            url=self.opencti_url,
            token=self.opencti_token,
            log_level=self.log_level,
            ssl_verify=self.ssl_verify,
            json_logging=self.json_logging,
        )
        self.worker_logger = self.api.logger_class("worker")

        # Start ping
        self.ping = PingAlive(self.worker_logger, self.api)
        self.ping.start()

        self.queue_name = self.connector["config"]["push"]
        self.pika_credentials = pika.PlainCredentials(
            self.connector["config"]["connection"]["user"],
            self.connector["config"]["connection"]["pass"],
        )
        ssl_options = None
        if self.connector["config"]["connection"]["use_ssl"]:
            ssl_options = pika.SSLOptions(
                create_mq_ssl_context(self.config),
                self.connector["config"]["connection"]["host"],
            )

        self.pika_parameters = pika.ConnectionParameters(
            self.connector["config"]["connection"]["host"],
            self.connector["config"]["connection"]["port"],
            self.connector["config"]["connection"]["vhost"],
            self.pika_credentials,
            ssl_options=ssl_options,
        )
        self.pika_connection = pika.BlockingConnection(self.pika_parameters)
        self.channel = self.pika_connection.channel()
        try:
            self.channel.confirm_delivery()
        except Exception as err:  # pylint: disable=broad-except
            self.worker_logger.warning(str(err))
        self.channel.basic_qos(prefetch_count=1)
        assert self.channel is not None
        self.processing_count: int = 0
        self.current_bundle_id: [str, None] = None
        self.current_bundle_seq: int = 0

    @property
    def id(self) -> Any:  # pylint: disable=inconsistent-return-statements
        if hasattr(self, "_thread_id"):
            return self._thread_id  # type: ignore  # pylint: disable=no-member
        # pylint: disable=protected-access
        for id_, thread in threading._active.items():  # type: ignore
            if thread is self:
                return id_

    def terminate(self) -> None:
        thread_id = self.id
        self.ping.stop()
        res = ctypes.pythonapi.PyThreadState_SetAsyncExc(
            thread_id, ctypes.py_object(SystemExit)
        )
        if res > 1:
            ctypes.pythonapi.PyThreadState_SetAsyncExc(thread_id, 0)
            self.worker_logger.info("Unable to kill the thread")

    def nack_message(self, channel: BlockingChannel, delivery_tag: int) -> None:
        if channel.is_open:
            self.worker_logger.info("Message rejected", {"tag": delivery_tag})
            channel.basic_nack(delivery_tag)
        else:
            self.worker_logger.info(
                "Message NOT rejected (channel closed)", {"tag": delivery_tag}
            )

    def ack_message(self, channel: BlockingChannel, delivery_tag: int) -> None:
        if channel.is_open:
            self.worker_logger.info("Message acknowledged", {"tag": delivery_tag})
            channel.basic_ack(delivery_tag)
        else:
            self.worker_logger.info(
                "Message NOT acknowledged (channel closed)", {"tag": delivery_tag}
            )

    def stop_consume(self, channel: BlockingChannel) -> None:
        self.ping.stop()
        if channel.is_open:
            channel.stop_consuming()

    # Callable for consuming a message
    def _process_message(
        self,
        channel: BlockingChannel,
        method: Any,
        properties: None,  # pylint: disable=unused-argument
        body: str,
    ) -> None:
        data = json.loads(body)
        self.worker_logger.info(
            "Processing a new message, launching a thread...",
            {"tag": method.delivery_tag},
        )
        thread = Thread(
            target=self.data_handler,
            args=[self.pika_connection, channel, method.delivery_tag, data],
        )
        thread.start()
        while thread.is_alive():  # Loop while the thread is processing
            self.pika_connection.sleep(0.05)
        self.worker_logger.info("Message processed, thread terminated")

    # Data handling
    def data_handler(  # pylint: disable=too-many-statements, too-many-locals
        self,
        connection: Any,
        channel: BlockingChannel,
        delivery_tag: str,
        data: Dict[str, Any],
    ) -> Optional[bool]:
        start_processing = datetime.datetime.now()
        # Set the API headers
        applicant_id = data["applicant_id"]
        self.api.set_applicant_id_header(applicant_id)
        work_id = data["work_id"] if "work_id" in data else None
        synchronized = data["synchronized"] if "synchronized" in data else False
        self.api.set_synchronized_upsert_header(synchronized)
        # Execute the import
        self.processing_count += 1
        content = "Unparseable"
        try:
            event_type = data["type"] if "type" in data else "bundle"
            types = (
                data["entities_types"]
                if "entities_types" in data and len(data["entities_types"]) > 0
                else None
            )
            processing_count = self.processing_count
            if self.processing_count == PROCESSING_COUNT:
                processing_count = None  # type: ignore
            if event_type == "bundle":
                content = base64.b64decode(data["content"]).decode("utf-8")
                update = data["update"] if "update" in data else False
                self.api.stix2.import_bundle_from_json(
                    content, update, types, processing_count
                )
                # Ack the message
                cb = functools.partial(self.ack_message, channel, delivery_tag)
                connection.add_callback_threadsafe(cb)
                if work_id is not None:
                    self.api.work.report_expectation(work_id, None)
                self.processing_count = 0
                bundles_success_counter.add(1)
                return True
            elif event_type == "event":
                event = base64.b64decode(data["content"]).decode("utf-8")
                event_content = json.loads(event)
                event_type = event_content["type"]
                if event_type == "create" or event_type == "update":
                    bundle = {
                        "type": "bundle",
                        "objects": [event_content["data"]],
                    }
                    self.api.stix2.import_bundle(bundle, True, types, processing_count)
                elif event_type == "delete":
                    delete_id = event_content["data"]["id"]
                    self.api.stix.delete(id=delete_id)
                elif event_type == "merge":
                    # Start with a merge
                    target_id = event_content["data"]["id"]
                    source_ids = list(
                        map(
                            lambda source: source["id"],
                            event_content["context"]["sources"],
                        )
                    )
                    self.api.stix.merge(id=target_id, object_ids=source_ids)
                    # Update the target entity after merge
                    bundle = {
                        "type": "bundle",
                        "objects": [event_content["data"]],
                    }
                    self.api.stix2.import_bundle(bundle, True, types, processing_count)
                # Ack the message
                cb = functools.partial(self.ack_message, channel, delivery_tag)
                connection.add_callback_threadsafe(cb)
                self.processing_count = 0
                bundles_success_counter.add(1)
                return True
            else:
                # Unknown type, just move on.
                return True
        except Timeout:
            bundles_timeout_error_counter.add(1)
            self.worker_logger.warning("A connection timeout occurred")
            time.sleep(60)
            # Platform is under heavy load: wait for unlock & retry almost indefinitely.
            sleep_jitter = round(random.uniform(10, 30), 2)
            time.sleep(sleep_jitter)
            self.data_handler(connection, channel, delivery_tag, data)
            return True
        except RequestException:
            bundles_request_error_counter.add(1, {"origin": "opencti-worker"})
            self.worker_logger.error(
                "Message NOT acknowledged",
                {"tag": delivery_tag, "type": "RequestException"},
            )
            cb = functools.partial(self.nack_message, channel, delivery_tag)
            connection.add_callback_threadsafe(cb)
            self.processing_count = 0
            return False
        except Exception as ex:  # pylint: disable=broad-except
            error = str(ex)
            error_msg = traceback.format_exc()
            if (
                "LOCK_ERROR" in error_msg
                and self.processing_count < MAX_PROCESSING_COUNT
            ):
                bundles_lock_error_counter.add(1)
                # Platform is under heavy load:
                # wait for unlock & retry almost indefinitely.
                sleep_jitter = round(random.uniform(10, 30), 2)
                time.sleep(sleep_jitter)
                self.data_handler(connection, channel, delivery_tag, data)
            elif (
                "MISSING_REFERENCE_ERROR" in error_msg
                and self.processing_count < PROCESSING_COUNT
            ):
                bundles_missing_reference_error_counter.add(1)
                # In case of missing reference, wait & retry
                sleep_jitter = round(random.uniform(1, 3), 2)
                time.sleep(sleep_jitter)
                self.worker_logger.info(
                    "Message reprocess",
                    {"tag": delivery_tag, "count": self.processing_count},
                )
                self.data_handler(connection, channel, delivery_tag, data)
            elif "MISSING_REFERENCE_ERROR" in error_msg:
                self.worker_logger.warning(error_msg)
                self.processing_count = 0
                cb = functools.partial(self.ack_message, channel, delivery_tag)
                connection.add_callback_threadsafe(cb)
                if work_id is not None:
                    self.api.work.report_expectation(
                        work_id,
                        {
                            "error": error,
                            "source": (
                                content if len(content) < 50000 else "Bundle too large"
                            ),
                        },
                    )
                return False
            elif "Bad Gateway" in error_msg:
                bundles_bad_gateway_error_counter.add(1)
                self.worker_logger.error("A connection error occurred")
                time.sleep(60)
                self.worker_logger.info(
                    "Message NOT acknowledged (Bad Gateway)", {"tag": delivery_tag}
                )
                cb = functools.partial(self.nack_message, channel, delivery_tag)
                connection.add_callback_threadsafe(cb)
                self.processing_count = 0
                return False
            else:
                bundles_technical_error_counter.add(1)
                # Platform does not know what to do and raises an error:
                # fail and acknowledge the message.
                self.worker_logger.error(error)
                self.processing_count = 0
                cb = functools.partial(self.ack_message, channel, delivery_tag)
                connection.add_callback_threadsafe(cb)
                if work_id is not None:
                    self.api.work.report_expectation(
                        work_id,
                        {
                            "error": error,
                            "source": (
                                content if len(content) < 50000 else "Bundle too large"
                            ),
                        },
                    )
                return False
            return None
        finally:
            bundles_global_counter.add(1)
            processing_delta = datetime.datetime.now() - start_processing
            bundles_processing_time_gauge.record(processing_delta.seconds)

    def run(self) -> None:
        try:
            # Consume the queue
            self.worker_logger.info(
                "Thread for queue started", {"queue": self.queue_name}
            )
            self.channel.basic_consume(
                queue=self.queue_name,
                on_message_callback=self._process_message,
            )
            self.channel.start_consuming()
        finally:
            self.channel.stop_consuming()
            self.worker_logger.info(
                "Thread for queue terminated", {"queue": self.queue_name}
            )


@dataclass(unsafe_hash=True)
class Worker:  # pylint: disable=too-few-public-methods, too-many-instance-attributes
    logs_all_queue: str = "logs_all"
    consumer_threads: Dict[str, Any] = field(default_factory=dict, hash=False)
    logger_threads: Dict[str, Any] = field(default_factory=dict, hash=False)

    def __post_init__(self) -> None:
        # Get configuration
        config_file_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "config.yml"
        )
        if os.path.isfile(config_file_path):
            with open(config_file_path, "r") as f:
                config = yaml.load(f, Loader=yaml.FullLoader)
        else:
            config = {}

        # Load API config
        self.config = config
        self.opencti_url = get_config_variable(
            "OPENCTI_URL", ["opencti", "url"], config
        )
        self.opencti_token = get_config_variable(
            "OPENCTI_TOKEN", ["opencti", "token"], config
        )
        self.opencti_ssl_verify = get_config_variable(
            "OPENCTI_SSL_VERIFY", ["opencti", "ssl_verify"], config, False, False
        )
        self.opencti_json_logging = get_config_variable(
            "OPENCTI_JSON_LOGGING", ["opencti", "json_logging"], config, False, True
        )
        # Load worker config
        self.log_level = get_config_variable(
            "WORKER_LOG_LEVEL", ["worker", "log_level"], config
        )
        # Telemetry
        self.telemetry_enabled = get_config_variable(
            "WORKER_TELEMETRY_ENABLED",
            ["worker", "telemetry_enabled"],
            config,
            False,
            False,
        )
        self.telemetry_prometheus_port = get_config_variable(
            "WORKER_PROMETHEUS_TELEMETRY_PORT",
            ["worker", "telemetry_prometheus_port"],
            config,
            True,
            14270,
        )
        self.telemetry_prometheus_host = get_config_variable(
            "WORKER_PROMETHEUS_TELEMETRY_HOST",
            ["worker", "telemetry_prometheus_host"],
            config,
            False,
            "0.0.0.0",
        )

        # Telemetry
        if self.telemetry_enabled:
            start_http_server(
                port=self.telemetry_prometheus_port, addr=self.telemetry_prometheus_host
            )
            provider = MeterProvider(
                resource=resource, metric_readers=[PrometheusMetricReader()]
            )
            metrics.set_meter_provider(provider)

        # Check if openCTI is available
        self.api = OpenCTIApiClient(
            url=self.opencti_url,
            token=self.opencti_token,
            log_level=self.log_level,
            ssl_verify=self.opencti_ssl_verify,
            json_logging=self.opencti_json_logging,
        )
        self.worker_logger = self.api.logger_class("worker")
        # Initialize variables
        self.connectors: List[Any] = []
        self.queues: List[Any] = []

    # Start the main loop
    def start(self) -> None:
        sleep_delay = 60
        while True:
            try:
                # Fetch queue configuration from API
                self.connectors = self.api.connector.list()
                self.queues = list(
                    map(lambda x: x["config"]["push"], self.connectors)  # type: ignore
                )
                # Check if all queues are consumed
                for connector in self.connectors:
                    queue = connector["config"]["push"]
                    if queue in self.consumer_threads:
                        if not self.consumer_threads[queue].is_alive():
                            self.worker_logger.info(
                                "Thread for queue not alive, creating a new one...",
                                {"queue": queue},
                            )
                            self.consumer_threads[queue] = Consumer(
                                connector,
                                self.config,
                                self.opencti_url,
                                self.opencti_token,
                                self.log_level,
                                self.opencti_ssl_verify,
                                self.opencti_json_logging,
                            )
                            self.consumer_threads[queue].start()
                    else:
                        self.consumer_threads[queue] = Consumer(
                            connector,
                            self.config,
                            self.opencti_url,
                            self.opencti_token,
                            self.log_level,
                            self.opencti_ssl_verify,
                            self.opencti_json_logging,
                        )
                        self.consumer_threads[queue].start()

                # Check if some threads must be stopped
                for thread in list(self.consumer_threads):
                    if thread not in self.queues:
                        self.worker_logger.info(
                            "Queue no longer exists, killing thread...",
                            {"thread": thread},
                        )
                        try:
                            self.consumer_threads[thread].terminate()
                            self.consumer_threads.pop(thread, None)
                        except:
                            self.worker_logger.info(
                                "Unable to kill the thread for queue, an operation is running, keep trying...",
                                {"thread": thread},
                            )
                time.sleep(sleep_delay)
            except KeyboardInterrupt:
                # Graceful stop
                for thread in self.consumer_threads:
                    if thread not in self.queues:
                        self.consumer_threads[thread].terminate()
                sys.exit(0)
            except Exception as e:  # pylint: disable=broad-except
                self.worker_logger.error(type(e).__name__, {"reason": str(e)})
                time.sleep(60)


if __name__ == "__main__":
    worker = Worker()
    try:
        worker.start()
    except Exception as e:  # pylint: disable=broad-except
        sys.exit(1)
