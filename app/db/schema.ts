import { relations, sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
};

export const certificates = sqliteTable("certificates", {
  id: text("id").primaryKey(),
  ohttpsCertificateId: text("ohttps_certificate_id").notNull(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  renewBeforeDays: integer("renew_before_days").notNull().default(20),
  status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
  currentVersionId: text("current_version_id"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  lastCheckedAt: integer("last_checked_at", { mode: "timestamp_ms" }),
  lastSyncAt: integer("last_sync_at", { mode: "timestamp_ms" }),
  ...timestamps,
});

export const certificateVersions = sqliteTable("certificate_versions", {
  id: text("id").primaryKey(),
  certificateId: text("certificate_id").notNull().references(() => certificates.id),
  version: integer("version").notNull(),
  fingerprint: text("fingerprint").notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  certPath: text("cert_path").notNull(),
  privateKeyPath: text("private_key_path").notNull(),
  validationStatus: text("validation_status", { enum: ["pending", "valid", "invalid"] }).notNull().default("pending"),
  validationError: text("validation_error"),
  ...timestamps,
}, (table) => ({ certificateVersionUnique: uniqueIndex("certificate_versions_certificate_version_idx").on(table.certificateId, table.version) }));

export const servers = sqliteTable("servers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull().default(22),
  username: text("username").notNull(),
  hostFingerprint: text("host_fingerprint"),
  authRef: text("auth_ref").notNull(),
  certPath: text("cert_path").notNull().default("/etc/nginx/ssl/fullchain.pem"),
  privateKeyPath: text("private_key_path").notNull().default("/etc/nginx/ssl/privkey.pem"),
  reloadCommand: text("reload_command").notNull().default("nginx -s reload"),
  healthCheckCommand: text("health_check_command"),
  timeoutSeconds: integer("timeout_seconds").notNull().default(30),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const deployments = sqliteTable("deployments", {
  id: text("id").primaryKey(),
  certificateId: text("certificate_id").notNull().references(() => certificates.id),
  certificateVersionId: text("certificate_version_id").notNull().references(() => certificateVersions.id),
  trigger: text("trigger", { enum: ["manual", "scheduled", "refresh", "retry"] }).notNull(),
  status: text("status", { enum: ["queued", "running", "succeeded", "failed", "cancelled", "partial"] }).notNull().default("queued"),
  failurePolicy: text("failure_policy", { enum: ["all_success", "allow_partial"] }).notNull().default("all_success"),
  concurrency: integer("concurrency").notNull().default(4),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  errorSummary: text("error_summary"),
  ...timestamps,
}, (table) => ({ deploymentStatusIdx: index("deployments_status_idx").on(table.status) }));

export const deploymentTargets = sqliteTable("deployment_targets", {
  id: text("id").primaryKey(),
  deploymentId: text("deployment_id").notNull().references(() => deployments.id),
  serverId: text("server_id").notNull().references(() => servers.id),
  status: text("status", { enum: ["queued", "running", "succeeded", "failed", "cancelled"] }).notNull().default("queued"),
  retryCount: integer("retry_count").notNull().default(0),
  exitCode: integer("exit_code"),
  errorSummary: text("error_summary"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => ({ deploymentTargetUnique: uniqueIndex("deployment_targets_deployment_server_idx").on(table.deploymentId, table.serverId) }));

export const logs = sqliteTable("logs", {
  id: text("id").primaryKey(),
  deploymentId: text("deployment_id").references(() => deployments.id),
  targetId: text("target_id").references(() => deploymentTargets.id),
  sequence: integer("sequence").notNull(),
  level: text("level", { enum: ["debug", "info", "warn", "error"] }).notNull().default("info"),
  message: text("message").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, (table) => ({ logSequenceIdx: uniqueIndex("logs_deployment_sequence_idx").on(table.deploymentId, table.sequence), logCreatedIdx: index("logs_created_at_idx").on(table.createdAt) }));

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull(),
  channel: text("channel").notNull().default("webhook"),
  status: text("status", { enum: ["pending", "delivered", "failed"] }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  responseSummary: text("response_summary"),
  nextRetryAt: integer("next_retry_at", { mode: "timestamp_ms" }),
  deliveredAt: integer("delivered_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => ({ eventUnique: uniqueIndex("notifications_event_channel_idx").on(table.eventId, table.channel) }));

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  actor: text("actor").notNull().default("admin"),
  action: text("action").notNull(),
  objectType: text("object_type").notNull(),
  objectId: text("object_id"),
  result: text("result", { enum: ["success", "failure"] }).notNull(),
  errorSummary: text("error_summary"),
  metadataJson: text("metadata_json"),
  ...timestamps,
}, (table) => ({ auditObjectIdx: index("audit_events_object_idx").on(table.objectType, table.objectId) }));

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  isSecret: integer("is_secret", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

export const admins = sqliteTable("admins", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique().default("admin"),
  passwordHash: text("password_hash").notNull(),
  lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
  ...timestamps,
});

export const certificatesRelations = relations(certificates, ({ many }) => ({ versions: many(certificateVersions), deployments: many(deployments) }));
export const certificateVersionsRelations = relations(certificateVersions, ({ one, many }) => ({ certificate: one(certificates, { fields: [certificateVersions.certificateId], references: [certificates.id] }), deployments: many(deployments) }));
export const deploymentsRelations = relations(deployments, ({ one, many }) => ({ certificate: one(certificates, { fields: [deployments.certificateId], references: [certificates.id] }), version: one(certificateVersions, { fields: [deployments.certificateVersionId], references: [certificateVersions.id] }), targets: many(deploymentTargets), logs: many(logs) }));
export const deploymentTargetsRelations = relations(deploymentTargets, ({ one, many }) => ({ deployment: one(deployments, { fields: [deploymentTargets.deploymentId], references: [deployments.id] }), server: one(servers, { fields: [deploymentTargets.serverId], references: [servers.id] }), logs: many(logs) }));
