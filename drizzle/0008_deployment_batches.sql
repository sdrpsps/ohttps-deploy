CREATE TABLE `deployment_certificates` (
	`id` text PRIMARY KEY NOT NULL,
	`deployment_id` text NOT NULL,
	`certificate_id` text NOT NULL,
	`certificate_version_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`certificate_id`) REFERENCES `certificates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`certificate_version_id`) REFERENCES `certificate_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deployment_certificates_deployment_cert_idx` ON `deployment_certificates` (`deployment_id`,`certificate_id`);
--> statement-breakpoint
ALTER TABLE `deployments` ADD `title` text;
