export interface ApiResponse<T> {
  data: T;
  success: true;
}

export interface ErrorResponse {
  error: string;
  success: false;
  statusCode?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  success: true;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
