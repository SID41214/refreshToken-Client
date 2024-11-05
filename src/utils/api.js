import axios from "axios";
const api = axios.create({
    baseURL: 'http://localhost:3000',
    withCredentials: true // Required for cookies
});
let isRefreshing = false;
// Store pending requests
let failedQueue = [];
const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
      if (error) {
          prom.reject(error);
      } else {
          prom.resolve(token);
      }
  });
  
  failedQueue = [];
};

// Request interceptor
api.interceptors.request.use(
  (config) => {
      const token = localStorage.getItem('accessToken');
      if (token) {
          config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
  },
  (error) => {
      return Promise.reject(error);
  }
);
// Response interceptor
api.interceptors.response.use(
  (response) => {
      return response;
  },
  async (error) => {
      const originalRequest = error.config;

      // If error is not 401 or request already retried, reject
      if (error.response?.status !== 401 || originalRequest._retry) {
          return Promise.reject(error);
      }

      // If refresh already in progress, queue this request
      if (isRefreshing) {
          return new Promise((resolve, reject) => {
              failedQueue.push({ resolve, reject });
          })
              .then(token => {
                  originalRequest.headers.Authorization = `Bearer ${token}`;
                  return api(originalRequest);
              })
              .catch(err => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
          // Call refresh token endpoint
          const response = await api.post('/refresh-token');
          const newToken = response.data.accessToken;
          
          // Store new token
          localStorage.setItem('accessToken', newToken);
          
          // Update authorization header
          api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          
          // Process pending requests
          processQueue(null, newToken);
          
          return api(originalRequest);
      } catch (refreshError) {
          processQueue(refreshError, null);
          
          // Clear tokens and redirect to login
          localStorage.removeItem('accessToken');
          window.location.href = '/login';
          
          return Promise.reject(refreshError);
      } finally {
          isRefreshing = false;
      }
  }
);
// API methods
export const apiService = {
    async getData(token) {
        return api.get('/protected',{headers:{
            Authorization:`Bearer ${token}`
        }});
    },
    
    async login(credentials) {
        const response = await api.post('/login', credentials);
        localStorage.setItem('accessToken', response.data.accessToken);
        return response;
    },
    
    async logout() {
        await api.post('/logout');
        localStorage.removeItem('accessToken');
    }
};

export default api;