export type Me = {
  nickname: string;
  is_moderator: boolean;
  active: boolean;
};

export type Message = {
  id: number;
  session_id: string;
  nickname: string;
  author_is_moderator: boolean;
  body: string;
  reply_to: number | null;
  is_hidden: boolean;
  hidden_reason: string | null;
  created_at: string;
};

export type IssueStatus = "open" | "in_progress" | "resolved";

export type Issue = {
  id: number;
  nickname: string;
  title: string;
  description: string;
  status: IssueStatus;
  is_hidden: boolean;
  is_mine: boolean;
  created_at: string;
  vote_count: number;
  voted: boolean;
};

export type PollOption = { id: number; label: string; votes: number };

export type Poll = {
  id: number;
  nickname: string;
  question: string;
  is_closed: boolean;
  is_hidden: boolean;
  is_mine: boolean;
  created_at: string;
  total: number;
  my_option: number | null;
  options: PollOption[];
};

export type QueueItem = {
  message_id: number;
  nickname: string;
  body: string;
  is_hidden: boolean;
  hidden_reason: string | null;
  report_count: number;
  reasons: string[];
  last_reported_at: string;
};

export type ModLogEntry = {
  moderator: string;
  action: string;
  target: string;
  reason: string | null;
  created_at: string;
};

export type Summary = {
  generated_at: string;
  members: number;
  participants: number;
  messages: number;
  issues: {
    id: number;
    title: string;
    description: string;
    status: IssueStatus;
    created_at: string;
    votes: number;
  }[];
  polls: Poll[];
};

export const STATUS_LABEL: Record<IssueStatus, string> = {
  open: "Open",
  in_progress: "Being followed up",
  resolved: "Resolved",
};
