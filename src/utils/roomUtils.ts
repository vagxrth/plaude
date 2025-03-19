import { v4 as uuidv4 } from 'uuid';

// Generate a random 6-character alphanumeric room ID
export const generateRoomId = (): string => {
  // Take the first 6 characters of a UUID and remove any hyphens
  return uuidv4().substring(0, 6).replace(/-/g, '');
};
