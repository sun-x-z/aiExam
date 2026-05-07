import { IMPORT_FIELDS, TEMPERATURE_OPTIONS, type ImportField } from "@/lib/types";
import { normalizeText } from "@/lib/import/normalize";

export { IMPORT_FIELDS, TEMPERATURE_OPTIONS };

export const FIELD_LABELS: Record<ImportField, string> = {
  externalCode: "外部编码",
  senderName: "发件人姓名",
  senderPhone: "发件人电话",
  senderAddress: "发件人地址",
  recipientName: "收件人姓名",
  recipientPhone: "收件人电话",
  recipientAddress: "收件人地址",
  weightKg: "重量(kg)",
  packageCount: "件数",
  temperatureZone: "温层",
  note: "备注",
};

export const REQUIRED_FIELDS: ImportField[] = [
  "senderName",
  "senderPhone",
  "senderAddress",
  "recipientName",
  "recipientPhone",
  "recipientAddress",
  "weightKg",
  "packageCount",
  "temperatureZone",
];

export const FIELD_ALIASES: Record<ImportField, string[]> = {
  externalCode: ["外部编码", "外部订单号", "客户单号", "订单号", "Ref Code", "Ref", "Order No", "External Code"],
  senderName: ["发件人姓名", "发件人", "发货人", "寄件人", "Sender", "From Name"],
  senderPhone: ["发件人电话", "发货电话", "发件电话", "寄件电话", "Sender Tel", "Sender Phone", "Phone"],
  senderAddress: ["发件人地址", "发货地址", "寄件地址", "Sender Address", "From Address"],
  recipientName: ["收件人姓名", "收件人", "收货人", "收方", "Receiver", "Recipient"],
  recipientPhone: ["收件人电话", "收货电话", "收件电话", "Receiver Tel", "Receiver Phone"],
  recipientAddress: ["收件人地址", "收货地址", "收方地址", "Receiver Address", "Recipient Address", "To Address"],
  weightKg: ["重量", "重量(kg)", "重量kg", "Weight", "Weight(kg)", "WeightKg"],
  packageCount: ["件数", "数量", "包裹数量", "Qty", "Quantity", "Count"],
  temperatureZone: ["温层", "温度要求", "温控", "Temp Zone", "Temperature", "Temperature Zone"],
  note: ["备注", "附言", "说明", "Note", "Remarks", "Memo"],
};

export const TEMPERATURE_ALIAS = TEMPERATURE_OPTIONS.map((option) => normalizeText(option));
