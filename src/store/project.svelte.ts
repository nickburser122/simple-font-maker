import type { SetId } from '../charset/sets';
import type { PaperId } from '../template/layout';

export const project: { setId: SetId; paper: PaperId } = $state({ setId: 'basic', paper: 'a4' });
