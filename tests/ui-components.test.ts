import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as React from "react";
(globalThis as any).React = React;
import { renderToString } from "react-dom/server";
import { useForm } from "react-hook-form";
import { Form, FormLabel } from "../app/components/ui/form";
import { Label } from "../app/components/ui/label";
import { LoginForm } from "../app/components/login-form";
import { queryKeys } from "../app/lib/api";
import { queryDefaults } from "../app/lib/query-config";

// 1. Verify that FormLabel throws when used outside of FormField
assert.throws(
  () => {
    function InvalidForm() {
      const form = useForm();
      return React.createElement(Form, {
        ...form,
        children: React.createElement(FormLabel, null, "Test"),
      });
    }
    renderToString(React.createElement(InvalidForm));
  },
  { message: "useFormField should be used within <FormField>" }
);

// 2. Verify that Label renders successfully without FormField
function ValidLabel() {
  return React.createElement(Label, { className: "text-sm font-medium" }, "自动部署目标服务器（可选）");
}
const html = renderToString(React.createElement(ValidLabel));
assert.ok(html.includes("自动部署目标服务器（可选）"));

// 3. Verify CertificateFormDialog uses Label instead of FormLabel for unmanaged fields
const certDialogContent = fs.readFileSync(
  path.resolve("app/components/console/certificate-form-dialog.tsx"),
  "utf-8"
);
assert.ok(
  !certDialogContent.includes('<FormLabel className="text-sm font-medium">自动部署目标服务器'),
  "FormLabel must not be used outside <FormField> in CertificateFormDialog"
);
assert.ok(
  certDialogContent.includes('<Label className="text-sm font-medium">自动部署目标服务器'),
  "Label must be used for server list title in CertificateFormDialog"
);

// 4. Verify route transitions and initial data loads have a visual loading state.
const dashboardSkeleton = fs.readFileSync(
  path.resolve("app/components/console/dashboard-skeleton.tsx"),
  "utf-8"
);
for (const section of ["overview", "certificates", "servers", "policies", "activity", "notifications"]) {
  assert.ok(
    dashboardSkeleton.includes(`section === "${section}"`) || dashboardSkeleton.includes(`section === "certificates" || section === "servers"`),
    `DashboardSkeleton must cover the ${section} section`
  );
}

const consoleLayoutContent = fs.readFileSync(
  path.resolve("app/components/console/console-layout.tsx"),
  "utf-8"
);
assert.ok(consoleLayoutContent.includes("useTransition"), "Console navigation must use a transition state");
assert.ok(consoleLayoutContent.includes("aria-busy={isNavigating}"), "Console content must expose its navigation loading state");

// 5. Pocket ID is the default entry; password recovery remains available without an IdP.
const pocketLogin = renderToString(React.createElement(LoginForm, { pocketIdEnabled: true, authError: true }));
assert.ok(pocketLogin.includes("使用通行密钥登录"));
assert.ok(pocketLogin.includes('aria-expanded="false"'));
assert.match(pocketLogin, /<form[^>]* hidden=""/);
assert.ok(pocketLogin.indexOf('role="alert"') < pocketLogin.indexOf("<form"), "OAuth errors must stay visible while the password form is hidden");
const passwordLogin = renderToString(React.createElement(LoginForm));
assert.ok(!passwordLogin.includes("使用通行密钥登录"));
assert.doesNotMatch(passwordLogin, /<form[^>]* hidden=/);
assert.ok(passwordLogin.includes('name="password"'));

// 6. Query config & key isolation
assert.equal(queryDefaults.staleTime, 30_000);
assert.equal(queryDefaults.refetchOnWindowFocus, false);
assert.equal(queryDefaults.refetchOnReconnect, false);
assert.equal(queryDefaults.retry, 1);
assert.notDeepEqual(queryKeys.logs("certificateId=one"), queryKeys.logs("certificateId=two"));

// 7. Frontend EventSource dependency stability & live target state contract
const activityPanelSrc = fs.readFileSync(path.resolve("app/components/activity-panel.tsx"), "utf-8");
assert.ok(activityPanelSrc.includes("[selectedIdForStream, isSelectedTerminal, queryClient]"));
assert.equal(activityPanelSrc.includes("[selected?.id, selected?.status, queryClient]"), false);
assert.ok(activityPanelSrc.includes("targets: updatedTargets"));

const syncSheetSrc = fs.readFileSync(path.resolve("app/components/console/sync-task-sheet.tsx"), "utf-8");
assert.ok(syncSheetSrc.includes("[taskId, hasTask, isTerminal, queryClient]"));
assert.equal(syncSheetSrc.includes("[taskId, task?.status, queryClient]"), false);

console.log("UI component contract tests passed");
