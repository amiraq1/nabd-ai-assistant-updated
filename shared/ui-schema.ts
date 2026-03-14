export const ALLOWED_UI_COMPONENT_TYPES = [
  "Container",
  "Text",
  "Button",
  "Input",
  "Image",
] as const;

export type UIComponentType = (typeof ALLOWED_UI_COMPONENT_TYPES)[number];

export interface UIComponent {
  type: UIComponentType;
  style?: string;
  text?: string;
  src?: string;
  placeholder?: string;
  children?: UIComponent[];
}

export interface UISchemaGeneratedEvent {
  type: "ui-schema.generated";
  conversationId: string;
  projectId: string;
  screenId: string;
  schema: UIComponent;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUIComponentType(value: unknown): value is UIComponentType {
  return (
    typeof value === "string" &&
    ALLOWED_UI_COMPONENT_TYPES.includes(value as UIComponentType)
  );
}

export function normalizeUIComponent(value: unknown): UIComponent | null {
  if (!isRecord(value) || !isUIComponentType(value.type)) {
    return null;
  }

  const normalized: UIComponent = {
    type: value.type,
  };

  if (value.style !== undefined) {
    if (typeof value.style !== "string") {
      return null;
    }
    normalized.style = value.style;
  }

  if (value.text !== undefined) {
    if (
      typeof value.text !== "string" ||
      (value.type !== "Text" && value.type !== "Button")
    ) {
      return null;
    }
    normalized.text = value.text;
  }

  if (value.src !== undefined) {
    if (typeof value.src !== "string" || value.type !== "Image") {
      return null;
    }
    normalized.src = value.src;
  }

  if (value.placeholder !== undefined) {
    if (typeof value.placeholder !== "string" || value.type !== "Input") {
      return null;
    }
    normalized.placeholder = value.placeholder;
  }

  if (value.type === "Image" && !normalized.src) {
    return null;
  }

  if (value.children !== undefined) {
    if (!Array.isArray(value.children)) {
      return null;
    }

    const normalizedChildren = value.children
      .map((child) => normalizeUIComponent(child))
      .filter((child): child is UIComponent => child !== null);

    if (normalizedChildren.length !== value.children.length) {
      return null;
    }

    normalized.children = normalizedChildren;
  }

  return normalized;
}

export function isUISchemaGeneratedEvent(value: unknown): value is UISchemaGeneratedEvent {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.type === "ui-schema.generated" &&
    typeof value.conversationId === "string" &&
    typeof value.projectId === "string" &&
    typeof value.screenId === "string" &&
    normalizeUIComponent(value.schema) !== null
  );
}
