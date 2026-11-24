import type { Metadata } from "next";
import ReportView from "@/components/ReportView";

export const metadata: Metadata = {
  title: "Class report · Anonymous Graduate Voice",
};

export default function ReportPage() {
  return <ReportView />;
}
