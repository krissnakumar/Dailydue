export * from '@controle-fiado/types';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}
