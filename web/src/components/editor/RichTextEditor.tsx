'use client'

import dynamic from 'next/dynamic'
import { useRef } from 'react'

const CKEditor = dynamic(
  () => import('@ckeditor/ckeditor5-react').then((m) => m.CKEditor),
  { ssr: false, loading: () => <div className="py-4 text-sm text-muted">กำลังโหลด editor…</div> },
)
import {
  ClassicEditor,
  Essentials,
  Paragraph,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Subscript,
  Superscript,
  Link,
  List,
  TodoList,
  Indent,
  BlockQuote,
  CodeBlock,
  Heading,
  Font,
  Alignment,
  Table,
  TableToolbar,
  Image,
  ImageToolbar,
  ImageCaption,
  ImageStyle,
  ImageResize,
  ImageUpload,
  FileRepository,
  MediaEmbed,
  Highlight,
  Code,
  RemoveFormat,
  HorizontalLine,
  SourceEditing,
  Autoformat,
  FindAndReplace,
} from 'ckeditor5'

import 'ckeditor5/ckeditor5.css'

const editorConfig = {
  licenseKey: 'GPL',
  plugins: [
    Essentials,
    Paragraph,
    Bold,
    Italic,
    Underline,
    Strikethrough,
    Subscript,
    Superscript,
    Link,
    List,
    TodoList,
    Indent,
    BlockQuote,
    CodeBlock,
    Heading,
    Font,
    Alignment,
    Table,
    TableToolbar,
    FileRepository,
    Image,
    ImageToolbar,
    ImageCaption,
    ImageStyle,
    ImageResize,
    ImageUpload,
    MediaEmbed,
    Highlight,
    Code,
    RemoveFormat,
    HorizontalLine,
    SourceEditing,
    Autoformat,
    FindAndReplace,
  ],
  toolbar: {
    items: [
      'undo',
      'redo',
      '|',
      'heading',
      '|',
      'bold',
      'italic',
      'underline',
      'strikethrough',
      '|',
      'link',
      'uploadImage',
      'insertTable',
      'mediaEmbed',
      '|',
      'bulletedList',
      'numberedList',
      'todoList',
      'indent',
      'outdent',
      '|',
      'alignment',
      'fontColor',
      'fontBackgroundColor',
      'fontSize',
      '|',
      'blockQuote',
      'codeBlock',
      'horizontalLine',
      '|',
      'findAndReplace',
      'sourceEditing',
      'removeFormat',
    ],
    shouldNotGroupWhenFull: true,
  },
  image: {
    toolbar: [
      'imageTextAlternative',
      'imageStyle:inline',
      'imageStyle:block',
      'imageStyle:side',
      'toggleImageCaption',
      'imageResize',
    ],
    upload: {
      types: ['jpeg', 'png', 'gif', 'webp'],
    },
  },
  table: {
    contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells'],
  },
  link: {
    addTargetToExternalLinks: true,
    defaultProtocol: 'https://',
  },
  placeholder: 'เริ่มพิมพ์รายละเอียดขอบเขตงาน เป้าหมาย หรือแนบรูปภาพประกอบ…',
}

export interface RichTextEditorProps {
  value?: string
  initialData?: string
  onChange?: (html: string) => void
  onImageUpload?: (file: File) => Promise<string>
}

export default function RichTextEditor({
  value,
  initialData,
  onChange,
  onImageUpload,
}: RichTextEditorProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null)

  return (
    <div className="rich-text-editor">
      <CKEditor
        editor={ClassicEditor}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config={editorConfig as any}
        data={value ?? initialData ?? ''}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onReady={(editor: any) => {
          editorRef.current = editor
          if (onImageUpload) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onChange={(_event: any, editor: any) => {
          onChange?.(editor.getData())
        }}
      />
    </div>
  )
}
