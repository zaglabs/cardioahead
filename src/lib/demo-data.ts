export type DemoStatus = "ready" | "collecting" | "invited";
export const statusLabels: Record<DemoStatus, string> = {
  ready: "מוכן לעיון",
  collecting: "ממתין למסמכים",
  invited: "הזמנה נוצרה",
};
export const demoCases: {
  id: string;
  label: string;
  time: string;
  purpose: string;
  status: DemoStatus;
  documents: number;
  initials: string;
}[] = [
  {
    id: "example-a",
    label: "מטופל לדוגמה א׳",
    time: "09:00",
    purpose: "ביקור ראשון",
    status: "ready",
    documents: 4,
    initials: "א",
  },
  {
    id: "example-b",
    label: "מטופלת לדוגמה ב׳",
    time: "09:30",
    purpose: "ביקורת",
    status: "collecting",
    documents: 2,
    initials: "ב",
  },
  {
    id: "example-c",
    label: "מטופל לדוגמה ג׳",
    time: "10:15",
    purpose: "ביקור ראשון",
    status: "invited",
    documents: 0,
    initials: "ג",
  },
  {
    id: "example-d",
    label: "מטופלת לדוגמה ד׳",
    time: "11:00",
    purpose: "ביקורת",
    status: "ready",
    documents: 3,
    initials: "ד",
  },
];
export const demoDocuments = [
  {
    id: "referral",
    label: "מכתב הפניה לדוגמה",
    file: "referral-example.pdf",
    type: "הפניה",
    pages: 1,
  },
  {
    id: "echo",
    label: "דו״ח אקו לדוגמה",
    file: "echo-example.pdf",
    type: "בדיקות",
    pages: 2,
  },
  {
    id: "medications",
    label: "רשימת תרופות לדוגמה",
    file: "medications-example.pdf",
    type: "תרופות",
    pages: 1,
  },
  {
    id: "history",
    label: "סיכום ביקור לדוגמה",
    file: "visit-example.pdf",
    type: "סיכומים",
    pages: 2,
  },
];
