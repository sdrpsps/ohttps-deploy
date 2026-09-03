import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as React from "react";
(globalThis as any).React = React;
import { renderToString } from "react-dom/server";
import { useForm } from "react-hook-form";
import { Form, FormLabel } from "../app/components/ui/form";
import { Label } from "../app/components/ui/label";

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
  !certDialogContent.includes("<FormLabel className=\"text-sm font-medium\">自动部署目标服务器"),
  "FormLabel must not be used outside <FormField> in CertificateFormDialog"
);
assert.ok(
  certDialogContent.includes("<Label className=\"text-sm font-medium\">自动部署目标服务器"),
  "Label must be used for server list title in CertificateFormDialog"
);

console.log("UI component contract tests passed");
