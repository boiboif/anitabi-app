import { anitabiApiHandler, anitabiHandler } from './handlers';

export const qh = () => {
  return 'qh' + Math.random().toString(36).substring(2, 4);
};

export const getG0JSON = anitabiHandler.get<any[][]>('/d/g0.json' + '?d=' + qh());
export const getG1JSON = anitabiHandler.get<any[][]>('/d/g1.json' + '?d=' + qh());
export const getG2JSON = anitabiHandler.get<any[][]>('/d/g2.json' + '?d=' + qh());
export const getG3JSON = anitabiHandler.get<any[][]>('/d/g3.json' + '?d=' + qh());
export const getG4JSON = anitabiHandler.get<any[][]>('/d/g4.json' + '?d=' + qh());
export const getG5JSON = anitabiHandler.get<any[][]>('/d/g5.json' + '?d=' + qh());

export const getGJSON = anitabiHandler.get<[any[][], number, number]>('/d/g.json' + '?d=' + qh());

export const getBangumiIcons = anitabiApiHandler.get<{ ids: string[]; src: string }>(
  '/bangumi/icons.svg' + '?d=' + qh(),
);
