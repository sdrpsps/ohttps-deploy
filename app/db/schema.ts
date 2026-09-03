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
  validationCommand: text("validation_command").notNull().default("sudo -n nginx -t"),
  reloadCommand: text("reload_command").notNull().default("sudo -n nginx -s reload"),
  healthCheckCommand: text("health_check_command"),
  timeoutSeconds: integer("timeout_seconds").notNull().default(30),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const certificateTargets = sqliteTable("certificate_targets", {
  certificateId: text("certificate_id").notNull().references(() => certificates.id),
  serverId: text("server_id").notNull().references(() => servers.id),
  autoDeploy: integer("auto_deploy", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
}, (table) => ({ certificateTargetUnique: uniqueIndex("certificate_targets_certificate_server_idx").on(table.certificateId, table.serverId) }));

export const deployments = sqliteTable("deployments", {
  id: text("id").primaryKey(),
  title: text("title"),
  certificateId: text("certificate_id").references(() => certificates.id),
  certificateVersionId: text("certificate_version_id").references(() => certificateVersions.id),
  syncJobId: text("sync_job_id").references(() => certificateSyncJobs.id),
  trigger: text("trigger", { enum: ["manual", "scheduled", "refresh", "retry"] }).notNull(),
  status: text("status", { enum: ["queued", "running", "succeeded", "failed", "cancelled", "partial"] }).notNull().default("queued"),
  failurePolicy: text("failure_policy", { enum: ["all_success", "allow_partial"] }).notNull().default("all_success"),
  concurrency: integer("concurrency").notNull().default(4),
  dryRun: integer("dry_run", { mode: "boolean" }).notNull().default(false),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  errorSummary: text("error_summary"),
  ...timestamps,
}, (table) => ({ deploymentStatusIdx: index("deployments_status_idx").on(table.status) }));

export const deploymentCertificates = sqliteTable("deployment_certificates", {
  id: text("id").primaryKey(),
  deploymentId: text("deployment_id").notNull().references(() => deployments.id, { onDelete: "cascade" }),
  certificateId: text("certificate_id").notNull().references(() => certificates.id),
  certificateVersionId: text("certificate_version_id").notNull().references(() => certificateVersions.id),
  ...timestamps,
}, (table) => ({
  deploymentCertUnique: uniqueIndex("deployment_certificates_deployment_cert_idx").on(table.deploymentId, table.certificateId),
}));

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
  syncJobId: text("sync_job_id").references(() => certificateSyncJobs.id),
  sequence: integer("sequence").notNull(),
  level: text("level", { enum: ["debug", "info", "warn", "error"] }).notNull().default("info"),
  message: text("message").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, (table) => ({
  logSequenceIdx: uniqueIndex("logs_deployment_sequence_idx").on(table.deploymentId, table.sequence),
  syncJobSequenceIdx: uniqueIndex("logs_sync_job_sequence_idx").on(table.syncJobId, table.sequence),
  syncJobIdx: index("logs_sync_job_idx").on(table.syncJobId),
  logCreatedIdx: index("logs_created_at_idx").on(table.createdAt),
}));

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull(),
  eventType: text("event_type").notNull(),
  objectType: text("object_type").notNull(),
  objectId: text("object_id"),
  payloadJson: text("payload_json").notNull(),
  channel: text("channel").notNull().default("webhook"),
  status: text("status", { enum: ["pending", "delivered", "failed"] }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  responseSummary: text("response_summary"),
  nextRetryAt: integer("next_retry_at", { mode: "timestamp_ms" }),
  deliveredAt: integer("delivered_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => ({ eventUnique: uniqueIndex("notifications_event_channel_idx").on(table.eventId, table.channel) }));

export const certificateSyncJobs = sqliteTable("certificate_sync_jobs", {
  id: text("id").primaryKey(),
  certificateId: text("certificate_id").notNull().references(() => certificates.id),
  trigger: text("trigger", { enum: ["manual", "scheduled"] }).notNull(),
  force: integer("force", { mode: "boolean" }).notNull().default(false),
  status: text("status", { enum: ["queued", "running", "succeeded", "failed", "cancelled"] }).notNull().default("queued"),
  phase: text("phase").notNull().default("queued"),
  errorSummary: text("error_summary"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => ({ syncJobStatusIdx: index("certificate_sync_jobs_status_idx").on(table.status) }));

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

// Better Auth core tables. Keep these names aligned with app/lib/better-auth.ts.
export const authUsers = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  username: text("username").unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
});

export const authSessions = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
}, (table) => ({ userIdx: index("session_user_id_idx").on(table.userId) }));

export const authAccounts = sqliteTable("account", {
  id: text("id").primaryKey(),
  issuer: text("issuer").notNull(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, (table) => ({
  issuerAccountIdx: uniqueIndex("account_issuer_account_idx").on(table.issuer, table.accountId),
  userIdx: index("account_user_id_idx").on(table.userId),
}));

export const authVerifications = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, (table) => ({ identifierIdx: index("verification_identifier_idx").on(table.identifier) }));

export const certificatesRelations = relations(certificates, ({ many }) => ({ versions: many(certificateVersions), deployments: many(deployments) }));
export const certificateVersionsRelations = relations(certificateVersions, ({ one, many }) => ({ certificate: one(certificates, { fields: [certificateVersions.certificateId], references: [certificates.id] }), deployments: many(deployments) }));
export const deploymentsRelations = relations(deployments, ({ one, many }) => ({ certificate: one(certificates, { fields: [deployments.certificateId], references: [certificates.id] }), version: one(certificateVersions, { fields: [deployments.certificateVersionId], references: [certificateVersions.id] }), certificates: many(deploymentCertificates), targets: many(deploymentTargets), logs: many(logs) }));
export const deploymentCertificatesRelations = relations(deploymentCertificates, ({ one }) => ({ deployment: one(deployments, { fields: [deploymentCertificates.deploymentId], references: [deployments.id] }), certificate: one(certificates, { fields: [deploymentCertificates.certificateId], references: [certificates.id] }), version: one(certificateVersions, { fields: [deploymentCertificates.certificateVersionId], references: [certificateVersions.id] }) }));
export const deploymentTargetsRelations = relations(deploymentTargets, ({ one, many }) => ({ deployment: one(deployments, { fields: [deploymentTargets.deploymentId], references: [deployments.id] }), server: one(servers, { fields: [deploymentTargets.serverId], references: [servers.id] }), logs: many(logs) }));
