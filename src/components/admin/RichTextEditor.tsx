'use client'

import { useEffect } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

type RichTextEditorProps = {
  content: string
  onChange: (html: string) => void
}

type ToolbarButtonProps = {
  label: string
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  testId: string
}

function ToolbarButton({
  label,
  pressed = false,
  disabled = false,
  onClick,
  testId,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className="secondary-btn admin-rich-text-editor__toolbar-btn"
      data-testid={testId}
      data-active={pressed ? 'true' : 'false'}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={(event) => {
        // Keep the current TipTap selection active while toggling formatting.
        event.preventDefault()
      }}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

export default function RichTextEditor({
  content,
  onChange,
}: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        horizontalRule: false,
      }),
    ],
    content,
    onUpdate: ({ editor: nextEditor }) => {
      onChange(nextEditor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'admin-rich-text-editor__content',
        'data-testid': 'rich-text-editor-content',
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    if (editor.getHTML() === content) return
    editor.commands.setContent(content || '<p></p>', { emitUpdate: false })
  }, [content, editor])

  if (!editor) {
    return (
      <div className="admin-rich-text-editor">
        <div className="admin-rich-text-editor__shell">
          <div className="admin-rich-text-editor__loading">编辑器加载中...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-rich-text-editor" data-testid="rich-text-editor">
      <div className="admin-rich-text-editor__toolbar">
        <ToolbarButton
          label="B"
          pressed={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          testId="rich-text-toolbar-bold"
        />
        <ToolbarButton
          label="I"
          pressed={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          testId="rich-text-toolbar-italic"
        />
        <ToolbarButton
          label="H2"
          pressed={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          testId="rich-text-toolbar-h2"
        />
        <ToolbarButton
          label="H3"
          pressed={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          testId="rich-text-toolbar-h3"
        />
        <ToolbarButton
          label="1."
          pressed={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          testId="rich-text-toolbar-ordered-list"
        />
        <ToolbarButton
          label="•"
          pressed={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          testId="rich-text-toolbar-bullet-list"
        />
        <ToolbarButton
          label="❝"
          pressed={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          testId="rich-text-toolbar-blockquote"
        />
      </div>

      <div className="admin-rich-text-editor__shell">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
