import { matchScore } from '../../../utils/matchScore';
import type { InstantSpotlightSource, SpotlightCommand, SpotlightItem } from '../spotlightTypes';

function toItem(sourceId: string, command: SpotlightCommand): SpotlightItem {
  return {
    id: `command:${sourceId}:${command.id}`,
    section: 'commands',
    title: command.title,
    icon: command.icon,
    run: (context) => {
      void command.run(context);
    },
  };
}

export function createCommandsSource(id: string, commands: SpotlightCommand[]): InstantSpotlightSource {
  return {
    id,
    commands: true,
    search: (query) => {
      if (!query) {
        return [...commands]
          .sort((a, b) => a.title.localeCompare(b.title))
          .map((command) => toItem(id, command));
      }

      return commands
        .map((command) => ({ command, score: matchScore(query, [command.title, ...(command.keywords ?? [])]) }))
        .filter((entry): entry is { command: SpotlightCommand; score: number } => entry.score !== null)
        .sort((a, b) => a.score - b.score)
        .map(({ command }) => toItem(id, command));
    },
  };
}
