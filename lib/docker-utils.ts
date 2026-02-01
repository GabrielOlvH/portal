import { DockerContainer } from './types';

/**
 * Check if a Docker container is running
 * @param container - Docker container object
 * @returns true if container is running
 */
export function isContainerRunning(container: DockerContainer): boolean {
  if (container.state) return container.state.toLowerCase() === 'running';
  if (container.status) return container.status.toLowerCase().startsWith('up');
  return false;
}
