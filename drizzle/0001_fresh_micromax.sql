CREATE TABLE `certificate_targets` (
	`certificate_id` text NOT NULL,
	`server_id` text NOT NULL,
	`auto_deploy` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`certificate_id`) REFERENCES `certificates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `certificate_targets_certificate_server_idx` ON `certificate_targets` (`certificate_id`,`server_id`);