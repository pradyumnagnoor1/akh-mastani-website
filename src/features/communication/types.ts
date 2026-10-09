export type PostKind = "announcement" | "task";
export type Audience = "individual" | "selected" | "group" | "segment" | "team";
export type CompletionMode = "individual" | "shared";
export type CommunicationPost = {
  id: string;
  title: string;
  body: string;
  kind: PostKind;
  completion_mode: CompletionMode;
  audience_type: Audience;
  audience_source_id: string | null;
  audience_label: string;
  due_on: string | null;
  expires_at?: string | null;
  image_path?: string | null;
  image_description?: string;
  version: number;
  archived_at: string | null;
  created_at: string;
  created_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
};
export type Recipient = {
  post_id: string;
  member_id: string;
  completed_at: string | null;
};
export type CommunicationGroup = {
  id: string;
  name: string;
  version: number;
  archived_at: string | null;
};
export type GroupMember = { group_id: string; member_id: string };
export type FormState = { error: string | null; success?: string };
