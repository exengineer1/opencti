import type { CsvMapperWithUserMarkings } from '../../../../src/modules/internal/csvMapper/csvMapper-types';
import { repAreaMarking, repMarking } from './representation-marking';

export const csvMapperAreaMarking: (
  markingPolicy?: string,
  userChosenMarkings?: string[]
) => Partial<CsvMapperWithUserMarkings> = (markingPolicy, userChosenMarkings) => ({
  id: 'mapper-area-malware-default',
  has_header: true,
  separator: ',',
  user_chosen_markings: userChosenMarkings,
  representations: [
    repAreaMarking(markingPolicy),
    repMarking
  ]
});
