// web/src/components/editor/RichTextEditor.tsx
'use client'

import dynamic from 'next/dynamic'
import { useRef } from 'react'

// CKEditor 5 ต้อง client-side เท่านั้น (SSR ไม่ได้)
const CKEditor = dynamic(
  () => import('@ckeditor/ckeditor5-react').then((m) => m.CKEditor),
  { ssr: false, loading: () => <div className="text-slate-500 text-sm py-4">กำลังโหลด editor…</div> },
)

import { ClassicEditor, Essentials, Paragraph, Bold, Italic, Underline, Strikethrough, Subscript, Superscript, Link, List, TodoList, Indent, BlockQuote, CodeBlock, Heading, Font, Alignment, Table, TableToolbar, Image, ImageCaption, ImageStyle, ImageResize, ImageUpload, MediaEmbed, Highlight, Code, RemoveFormat, HorizontalLine, PageBreak, SourceEditing, Autoformat, FindAndReplace, SpecialCharacters, SpecialCharactersEssentials, Mention } from 'ckeditor5'

import 'ckeditor5/ckeditor5.css'

const editorConfig = {
  licenseKey: 'GPL', // open-source GPL license
  plugins: [
    Essentials, Paragraph, Bold, Italic, Underline, Strikethrough, Subscript, Superscript,
    Link, List, TodoList, Indent, BlockQuote, CodeBlock, Heading, Font, Alignment,
    Table, TableToolbar, Image, ImageCaption, ImageStyle, ImageResize, ImageUpload,
    MediaEmbed, Highlight, Code, RemoveFormat, HorizontalLine, PageBreak,
    SourceEditing, Autoformat, FindAndReplace, SpecialCharacters, SpecialCharactersEssentials,
    Mention,
  ],
  toolbar: {
    items: [
      'undo', 'redo', '|',
      'heading', '|',
      'bold', 'italic', 'underline', 'strikethrough', '|',
      'link', 'insertImage', 'insertTable', 'mediaEmbed', '|',
      'bulletedList', 'numberedList', 'todoList', 'indent', 'outdent', '|',
      'alignment', 'fontColor', 'fontBackgroundColor', 'fontSize', 'fontFamily', '|',
      'blockQuote', 'codeBlock', 'horizontalLine', '|',
      'findAndReplace', 'sourceEditing', 'removeFormat',
    ],
    shouldNotGroupWhenFull: true,
  },
  heading: {
    options: [
      { model: 'paragraph' as any, title: 'Paragraph', class: 'ck-heading_paragraph' },
      { model: 'heading1' as any, view: 'h1', title: 'Heading 1', class: 'ck-heading_heading1' },
      { model: 'heading2' as any, view: 'h2', title: 'Heading 2', class: 'ck-heading_heading2' },
      { model: 'heading3' as any, view: 'h3', title: 'Heading 3', class: 'ck-heading_heading3' },
    ],
  },
  image: {
    toolbar: ['imageTextAlternative', 'imageStyle:inline', 'imageStyle:block', 'imageStyle:side', 'toggleImageCaption', 'imageResize'],
    upload: {
      types: ['jpeg', 'png', 'gif', 'webp'],
    },
  },
  table: {
    contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells', 'tableProperties', 'tableCellProperties'],
  },
  link: {
    addTargetToExternalLinks: true,
    defaultProtocol: 'https://',
  },
  placeholder: 'เริ่มพิมพ์เนื้อหา…',
}

export interface RichTextEditorProps {
  value?: string
  onChange?: (html: string) => void
  onImageUpload?: (file: File) => Promise<string> // return URL
}

export default function RichTextEditor({ value, onChange, onImageUpload }: RichTextEditorProps) {
  const editorRef = useRef<any>(null)

  return (
    <div className="rich-text-editor">
      <CKEditor
        editor={ClassicEditor}
        config={editorConfig}
        data={value || ''}
        onReady={(editor: any) => {
          editorRef.current = editor
          // custom upload adapter for images → Google Drive
          if (onImageUpload) {
            editor.plugins.get('FileRepository').createUploadAdapter = (loader: any) => ({
              upload: async () => {
                const file = await loader.file
                const url = await onImageUpload(file)
                return { default: url }
              },
              abort: () => {},
            })
          }
        }}
        onChange={(_event: any, editor: any) => {
          onChange?.(editor.getData())
        }}
      />
    </div>
  )
}
