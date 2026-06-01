import { anitabiApiHandler, anitabiHandler } from './handlers';

export const getG0JSON = anitabiHandler.get<any[][]>('/d/g0.json');
export const getG1JSON = anitabiHandler.get<any[][]>('/d/g1.json');
export const getG2JSON = anitabiHandler.get<any[][]>('/d/g2.json');
export const getG3JSON = anitabiHandler.get<any[][]>('/d/g3.json');
export const getG4JSON = anitabiHandler.get<any[][]>('/d/g4.json');
export const getG5JSON = anitabiHandler.get<any[][]>('/d/g5.json');

export const getGJSON = anitabiHandler.get<[any[][], number, number]>('/d/g.json');

export const getBangumiIcons = anitabiApiHandler.get<{ ids: string[]; src: string }>('/bangumi/icons.svg');
