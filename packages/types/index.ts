// Document types
export type DocumentType = 'pdf' | 'article'

export type ReadingState = 'unread' | 'reading' | 'library' | 'archived'

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink'

export interface Document {
  id: string
  user_id: string
  type: DocumentType
  title: string
  source_url: string | null
  storage_path: string
  reading_state: ReadingState
  created_at: string
}

export interface DocumentPage {
  id: string
  document_id: string
  page_number: number
  raw_text: string
}

export interface Highlight {
  id: string
  document_id: string
  user_id: string
  text: string
  color: HighlightColor
  page_ref: number | null
  created_at: string
}

export interface Bookmark {
  id: string
  document_id: string
  user_id: string
  page_number: number
  label: string
  created_at: string
}

export interface Note {
  id: string
  highlight_id: string
  user_id: string
  content: string
  created_at: string
}

export interface AIMessage {
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
}

export interface Citation {
  page?: number
  paragraph?: number
  text: string
}

export interface AIConversation {
  id: string
  document_id: string
  user_id: string
  messages: AIMessage[]
  created_at: string
}

export interface ReadingSession {
  id: string
  document_id: string
  user_id: string
  started_at: string
  ended_at: string | null
  progress_pct: number
}

export interface Tag {
  id: string
  user_id: string
  name: string
}

export interface Collection {
  id: string
  user_id: string
  name: string
}

// ContentProvider interface — all document types implement this
export interface ContentProvider {
  getMetadata(): Promise<{ title: string; pageCount?: number; wordCount?: number }>
  getPages(): Promise<DocumentPage[]>
  getFullText(): Promise<string>
  isScanned(): Promise<boolean>
}
