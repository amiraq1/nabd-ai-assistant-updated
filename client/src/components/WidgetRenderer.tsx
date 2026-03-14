import { type ReactNode } from "react";

export interface WidgetSchema {
  type: string;
  style?: string;
  text?: string;
  src?: string;
  placeholder?: string;
  children?: WidgetSchema[];
}

interface WidgetRendererProps {
  schema: WidgetSchema | null | undefined;
}

type KnownWidgetType = "Container" | "Text" | "Button" | "Input" | "Image";
type WidgetRenderFn = (schema: WidgetSchema, children: ReactNode) => JSX.Element;

const widgetRenderers: Record<KnownWidgetType, WidgetRenderFn> = {
  Container: (schema, children) => <div className={schema.style}>{children}</div>,
  Text: (schema, children) => (
    <p className={schema.style}>
      {schema.text}
      {children}
    </p>
  ),
  Button: (schema, children) => (
    <button type="button" className={schema.style}>
      {schema.text}
      {children}
    </button>
  ),
  Input: (schema) => (
    <input
      type="text"
      className={schema.style}
      defaultValue={schema.text}
      placeholder={schema.placeholder}
      readOnly
    />
  ),
  Image: (schema) => (
    <img
      src={schema.src}
      alt={schema.text ?? "Generated UI asset"}
      className={schema.style}
    />
  ),
};

function isKnownWidgetType(type: string): type is KnownWidgetType {
  return type in widgetRenderers;
}

function renderChildren(children: WidgetSchema[] | undefined): ReactNode {
  if (!children || children.length === 0) {
    return null;
  }

  return children.map((child, index) => (
    <WidgetRenderer schema={child} key={`${child.type}-${index}`} />
  ));
}

export function WidgetRenderer({ schema }: WidgetRendererProps): JSX.Element | null {
  if (!schema || !isKnownWidgetType(schema.type)) {
    return null;
  }

  const renderer = widgetRenderers[schema.type];
  return renderer(schema, renderChildren(schema.children));
}
