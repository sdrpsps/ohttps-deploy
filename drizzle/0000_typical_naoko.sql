CREATE TABLE `admins` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text DEFAULT 'admin' NOT NULL,
	`password_hash` text NOT NULL,
	`last_login_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admins_username_unique` ON `admins` (`username`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text DEFAULT 'admin' NOT NULL,
	`action` text NOT NULL,
	`object_type` text NOT NULL,
	`object_id` text,
	`result` text NOT NULL,
	`error_summary` text,
	`metadata_json` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_events_object_idx` ON `audit_events` (`object_type`,`object_id`);--> statement-breakpoint
CREATE TABLE `certificate_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`certificate_id` text NOT NULL,
	`version` integer NOT NULL,
	`fingerprint` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`cert_path` text NOT NULL,
	`private_key_path` text NOT NULL,
	`validation_status` text DEFAULT 'pending' NOT NULL,
	`validation_error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`certificate_id`) REFERENCES `certificates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `certificate_versions_certificate_version_idx` ON `certificate_versions` (`certificate_id`,`version`);--> statement-breakpoint
CREATE TABLE `certificates` (
	`id` text PRIMARY KEY NOT NULL,
	`ohttps_certificate_id` text NOT NULL,
	`name` text NOT NULL,
	`domain` text NOT NULL,
	`renew_before_days` integer DEFAULT 20 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`current_version_id` text,
	`expires_at` integer,
	`last_checked_at` integer,
	`last_sync_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `deployment_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`deployment_id` text NOT NULL,
	`server_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`exit_code` integer,
	`error_summary` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deployment_targets_deployment_server_idx` ON `deployment_targets` (`deployment_id`,`server_id`);--> statement-breakpoint
CREATE TABLE `deployments` (
	`id` text PRIMARY KEY NOT NULL,
	`certificate_id` text NOT NULL,
	`certificate_version_id` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`failure_policy` text DEFAULT 'all_success' NOT NULL,
	`concurrency` integer DEFAULT 4 NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`error_summary` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`certificate_id`) REFERENCES `certificates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`certificate_version_id`) REFERENCES `certificate_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `deployments_status_idx` ON `deployments` (`status`);--> statement-breakpoint
CREATE TABLE `logs` (
	`id` text PRIMARY KEY NOT NULL,
	`deployment_id` text,
	`target_id` text,
	`sequence` integer NOT NULL,
	`level` text DEFAULT 'info' NOT NULL,
	`message` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_id`) REFERENCES `deployment_targets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `logs_deployment_sequence_idx` ON `logs` (`deployment_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `logs_created_at_idx` ON `logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`channel` text DEFAULT 'webhook' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`response_summary` text,
	`next_retry_at` integer,
	`delivered_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_event_channel_idx` ON `notifications` (`event_id`,`channel`);--> statement-breakpoint
CREATE TABLE `servers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`host` text NOT NULL,
	`port` integer DEFAULT 22 NOT NULL,
	`username` text NOT NULL,
	`host_fingerprint` text,
	`auth_ref` text NOT NULL,
	`cert_path` text DEFAULT '/etc/nginx/ssl/fullchain.pem' NOT NULL,
	`private_key_path` text DEFAULT '/etc/nginx/ssl/privkey.pem' NOT NULL,
	`reload_command` text DEFAULT 'nginx -s reload' NOT NULL,
	`health_check_command` text,
	`timeout_seconds` integer DEFAULT 30 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`is_secret` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
