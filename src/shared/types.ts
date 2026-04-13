export interface TaskEvent {
  task_id: string;
  payload: Record<string, any>,
  status?: string;
  retry_count?: number;
  processed_at?: string;
  completed_at?: string;
  failed_at?: string;
  error?: unknown;
}

export interface SQSBatchResponse {
  batchItemFailures: Array<{ itemIdentifier: string }>;
}