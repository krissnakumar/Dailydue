export * from '@dailydue/types';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}
