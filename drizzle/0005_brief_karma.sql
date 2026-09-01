ALTER TABLE `certificate_sync_jobs` ADD `phase` text DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE `logs` ADD `sync_job_id` text REFERENCES certificate_sync_jobs(id);--> statement-breakpoint
CREATE UNIQUE INDEX `logs_sync_job_sequence_idx` ON `logs` (`sync_job_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `logs_sync_job_idx` ON `logs` (`sync_job_id`);