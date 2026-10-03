import { NAV_ITEMS } from '../../shell/navItems';
import { matchScore } from '../../../utils/matchScore';
import type { InstantSpotlightSource, SpotlightItem } from '../spotlightTypes';

export const pagesSource: InstantSpotlightSource = {
  id: 'pages',
  search: (query) =>
    NAV_ITEMS.map((page) => ({ page, score: matchScore(query, [page.label, ...page.keywords], 2) }))
      .filter((entry): entry is { page: (typeof NAV_ITEMS)[number]; score: number } => entry.score !== null)
      .sort((a, b) => a.score - b.score)
      .map(
        ({ page }): SpotlightItem => ({
          id: `page:${page.to}`,
          section: 'pages',
          title: page.label,
          icon: page.icon,
          run: ({ navigate }) => navigate(page.to),
        }),
      ),
};
