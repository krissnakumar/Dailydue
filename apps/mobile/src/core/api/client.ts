import { supabase } from '@controle-fiado/api';
import { ApiResponse } from './types';

export const apiClient = {
  ...supabase,
  safeRequest: async <T>(apiCall: () => Promise<any>): Promise<ApiResponse<T>> => {
    try {
      const response = await apiCall();
      if (response.error) {
        return {
          success: false,
          error: response.error.message || String(response.error),
        };
      }
      return {
        success: true,
        data: response.data as T,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || String(err),
      };
    }
  }
};

export default apiClient;
