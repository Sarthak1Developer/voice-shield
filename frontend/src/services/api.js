import axios from 'axios';

const API_BASE = 'http://localhost:8000';

const client = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

/**
 * Checks the status of the backend API.
 */
export async function checkHealth() {
  try {
    const response = await client.get('/health');
    return response.data?.status === 'ok';
  } catch (error) {
    console.error('Backend health check failed:', error.message);
    return false;
  }
}

/**
 * Initiates a new call session.
 */
export async function createCall(callerId, receiverId) {
  try {
    const response = await client.post('/api/calls/', {
      caller_id: callerId,
      receiver_id: receiverId,
      status: 'started',
    });
    return response.data;
  } catch (error) {
    console.error('Failed to create call:', error.message);
    throw error;
  }
}

/**
 * Submits analytical feature results for an active call.
 */
export async function analyzeCall(callId, features) {
  try {
    const response = await client.post(`/api/calls/${callId}/analysis`, {
      call_id: callId,
      deepfake_score: features.deepfakeScore ?? 0.15,
      speaker_similarity: features.speakerSimilarity ?? 0.90,
      prosody_score: features.prosodyScore ?? 0.12,
      context_score: features.contextScore ?? 0.20,
    });
    return response.data;
  } catch (error) {
    console.error('Failed to analyze call:', error.message);
    throw error;
  }
}

/**
 * Uploads an audio file for offline deepfake/risk analysis.
 */
export async function uploadAudioFile(file) {
  try {
    const formData = new FormData();
    formData.append('file', file);
    const response = await client.post('/api/analysis/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  } catch (error) {
    console.error('Failed to upload audio file:', error.message);
    throw error;
  }
}

/**
 * Registers a new user.
 */
export async function registerUser(name, email, phone, password) {
  try {
    const response = await client.post('/api/auth/register', {
      name,
      email,
      phone,
      password,
    });
    return response.data;
  } catch (error) {
    console.error('Registration failed:', error.response?.data?.detail || error.message);
    throw new Error(error.response?.data?.detail || 'Registration failed');
  }
}

/**
 * Logins a user using name or email, and password.
 */
export async function loginUser(username, password) {
  try {
    const response = await client.post('/api/auth/login', {
      username,
      password,
    });
    return response.data;
  } catch (error) {
    console.error('Login failed:', error.response?.data?.detail || error.message);
    throw new Error(error.response?.data?.detail || 'Login failed');
  }
}

export default {
  checkHealth,
  createCall,
  analyzeCall,
  uploadAudioFile,
  registerUser,
  loginUser,
};
