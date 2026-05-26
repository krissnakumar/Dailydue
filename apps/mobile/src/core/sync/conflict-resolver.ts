export const conflictResolver = {
  resolveLWW: <T extends { updated_at: string }>(local: T, remote: T): T => {
    const localTime = new Date(local.updated_at).getTime();
    const remoteTime = new Date(remote.updated_at).getTime();
    return localTime >= remoteTime ? local : remote;
  },
};
export default conflictResolver;
