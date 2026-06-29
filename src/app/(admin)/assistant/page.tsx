import { AssistantWorkspace } from "./assistant-workspace";

export const metadata = { title: "Assistant" };

export default function AssistantPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold text-gray-900">Assistant</h1>
      <p className="mt-1 text-sm text-gray-500">
        Ask questions about your data in plain English. Every answer shows the
        exact queries it ran — and it will tell you when the data can&apos;t
        answer something rather than guess.
      </p>
      <div className="mt-6">
        <AssistantWorkspace />
      </div>
    </div>
  );
}
