CREATE INDEX IF NOT EXISTS `deployments_status_created_at_idx` ON `deployments` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `deployments_certificate_created_at_idx` ON `deployments` (`certificate_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `certificate_sync_jobs_status_created_at_idx` ON `certificate_sync_jobs` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `certificate_sync_jobs_certificate_status_idx` ON `certificate_sync_jobs` (`certificate_id`,`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notifications_status_next_retry_at_idx` ON `notifications` (`status`,`next_retry_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notifications_object_created_at_idx` ON `notifications` (`object_type`,`object_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `logs_target_id_idx` ON `logs` (`target_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `logs_deployment_created_at_idx` ON `logs` (`deployment_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_events_created_at_idx` ON `audit_events` (`created_at`);
