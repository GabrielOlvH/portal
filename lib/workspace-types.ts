import type { Host, HostStatus, Session } from './types';

export type SessionWithHost = Session & {
  host: Host;
  hostStatus: HostStatus;
  hostIndex: number;
};

export type Window = {
  id: string;
  route: string;
  params?: Record<string, string>;
};

export type Workspace = {
  id: string;
  windows: Window[];
};
