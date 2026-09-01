PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`host` text NOT NULL,
	`port` integer DEFAULT 22 NOT NULL,
	`username` text NOT NULL,
	`host_fingerprint` text,
	`auth_ref` text NOT NULL,
	`cert_path` text DEFAULT '/etc/nginx/ssl/fullchain.pem' NOT NULL,
	`private_key_path` text DEFAULT '/etc/nginx/ssl/privkey.pem' NOT NULL,
	`validation_command` text DEFAULT 'sudo -n nginx -t' NOT NULL,
	`reload_command` text DEFAULT 'sudo -n nginx -s reload' NOT NULL,
	`health_check_command` text,
	`timeout_seconds` integer DEFAULT 30 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_servers`("id", "name", "host", "port", "username", "host_fingerprint", "auth_ref", "cert_path", "private_key_path", "validation_command", "reload_command", "health_check_command", "timeout_seconds", "enabled", "created_at", "updated_at") SELECT "id", "name", "host", "port", "username", "host_fingerprint", "auth_ref", "cert_path", "private_key_path", 'sudo -n nginx -t', CASE WHEN "reload_command" = 'nginx -s reload' THEN 'sudo -n nginx -s reload' ELSE "reload_command" END, "health_check_command", "timeout_seconds", "enabled", "created_at", "updated_at" FROM `servers`;--> statement-breakpoint
DROP TABLE `servers`;--> statement-breakpoint
ALTER TABLE `__new_servers` RENAME TO `servers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
