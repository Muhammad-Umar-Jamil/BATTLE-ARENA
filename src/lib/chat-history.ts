export type ArchivedChatMessage = {
  id: string
  username: string
  level_id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
  deleted_at: string
}

export type ArchivedChatLevel = {
  levelId: number
  messageCount: number
  latestActivity: string
  messages: ArchivedChatMessage[]
}

export type ArchivedChatTeam = {
  username: string
  messageCount: number
  latestActivity: string
  levels: ArchivedChatLevel[]
}

function archiveTime(row: ArchivedChatMessage) {
  return new Date(row.deleted_at || row.created_at).getTime() || 0
}

function messageTime(row: ArchivedChatMessage) {
  return new Date(row.created_at).getTime() || 0
}

export function groupArchivedChats(rows: ArchivedChatMessage[]): ArchivedChatTeam[] {
  const teams = new Map<string, Map<number, ArchivedChatMessage[]>>()
  for (const row of rows) {
    const levels = teams.get(row.username) ?? new Map<number, ArchivedChatMessage[]>()
    const messages = levels.get(row.level_id) ?? []
    messages.push(row)
    levels.set(row.level_id, messages)
    teams.set(row.username, levels)
  }

  return [...teams.entries()].map(([username, levels]) => {
    const groupedLevels = [...levels.entries()].map(([levelId, messages]) => {
      const sortedMessages = [...messages].sort((a, b) => messageTime(a) - messageTime(b))
      const latestRow = messages.reduce<ArchivedChatMessage | null>((latest, row) => !latest || archiveTime(row) > archiveTime(latest) ? row : latest, null)
      const latestActivity = latestRow ? (latestRow.deleted_at || latestRow.created_at) : ''
      return { levelId, messageCount: sortedMessages.length, latestActivity, messages: sortedMessages }
    }).sort((a, b) => new Date(b.latestActivity).getTime() - new Date(a.latestActivity).getTime())
    return {
      username,
      messageCount: groupedLevels.reduce((total, level) => total + level.messageCount, 0),
      latestActivity: groupedLevels[0]?.latestActivity ?? '',
      levels: groupedLevels,
    }
  }).sort((a, b) => new Date(b.latestActivity).getTime() - new Date(a.latestActivity).getTime())
}
