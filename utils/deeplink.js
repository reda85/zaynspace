import { Share } from 'react-native';

export const DeepLinkUtils = {
  // Generate task deep link with custom domain
  createTaskLink: (taskId) => {
    return `https://zaynspace.com/task/${taskId}`;
  },

  // Generate pin deep link
  createPinLink: (pinId) => {
    return `https://zaynspace.com/pin/${pinId}`;
  },

  // Generate project deep link
  createProjectLink: (projectId) => {
    return `https://zaynspace.com/project/${projectId}`;
  },

  // Share task
  shareTask: async (task) => {
    const url = DeepLinkUtils.createTaskLink(task.id);
    
    try {
      await Share.share({
        message: `Consultez cette tâche: ${task.name}\n${task.note || ''}\n\n${url}`,
        url: url,
        title: 'Partager la tâche',
      });
    } catch (error) {
      console.error('Error sharing task:', error);
    }
  },

  // Share pin
  sharePin: async (pin) => {
    const url = DeepLinkUtils.createPinLink(pin.id);
    
    try {
      await Share.share({
        message: `Consultez ce pin: ${pin.name}\n\n${url}`,
        url: url,
        title: 'Partager le pin',
      });
    } catch (error) {
      console.error('Error sharing pin:', error);
    }
  },
};