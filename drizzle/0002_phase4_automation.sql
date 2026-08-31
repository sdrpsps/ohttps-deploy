ALTER TABLE `notifications` ADD `event_type` text NOT NULL DEFAULT 'legacy';
--> statement-breakpoint
ALTER TABLE `notifications` ADD `object_type` text NOT NULL DEFAULT 'system';
--> statement-breakpoint
ALTER TABLE `notifications` ADD `object_id` text;
--> statement-breakpoint
ALTER TABLE `notifications` ADD `payload_json` text NOT NULL DEFAULT '{}';
--> statement-breakpoint
CREATE TABLE `certificate_sync_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`certificate_id` text NOT NULL,
	`trigger` text NOT NULL,
	`force` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`error_summary` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`certificate_id`) REFERENCES `certificates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `certificate_sync_jobs_status_idx` ON `certificate_sync_jobs` (`status`);
