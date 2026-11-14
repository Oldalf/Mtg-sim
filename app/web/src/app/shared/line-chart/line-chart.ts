import { Component, computed, input } from '@angular/core';

/** One line of the chart: a name and the value at each x (the first value belongs to `firstX`). */
export interface ChartLine {
  label: string;
  values: number[];
}

interface DrawnPoint {
  x: number;
  y: number;
  description: string;
}

interface DrawnLine {
  label: string;
  colour: string;
  dashes: string;
  path: string;
  points: DrawnPoint[];
}

interface Tick {
  position: number;
  label: string;
}

const WIDTH = 640;
const HEIGHT = 320;
const MARGIN = { left: 44, right: 16, top: 12, bottom: 36 };

/** Lines differ by colour and by dash pattern, so they can be told apart without colour. */
const LINE_STYLES = [
  { colour: '#ffb74d', dashes: '' },
  { colour: '#4dd0e1', dashes: '8 4' },
  { colour: '#ba68c8', dashes: '2 4' },
  { colour: '#81c784', dashes: '10 3 2 3' },
  { colour: '#f06292', dashes: '4 4' },
  { colour: '#90a4ae', dashes: '1 3' },
];

/**
 * A line chart drawn with SVG: percentages (0 to 100) against whole numbers on the x axis, such as the share of
 * games won by each turn. Each point has a tooltip with its value.
 */
@Component({
  selector: 'app-line-chart',
  template: `
    <figure>
      <svg
        [attr.viewBox]="'0 0 ' + width + ' ' + height"
        role="img"
        [attr.aria-label]="description()"
      >
        @for (tick of yTicks(); track tick.label) {
          <line
            class="grid"
            [attr.x1]="margin.left"
            [attr.x2]="width - margin.right"
            [attr.y1]="tick.position"
            [attr.y2]="tick.position"
          />
          <text
            class="tick"
            text-anchor="end"
            [attr.x]="margin.left - 6"
            [attr.y]="tick.position + 4"
          >
            {{ tick.label }}
          </text>
        }
        @for (tick of xTicks(); track tick.label) {
          <text
            class="tick"
            text-anchor="middle"
            [attr.x]="tick.position"
            [attr.y]="height - margin.bottom + 18"
          >
            {{ tick.label }}
          </text>
        }
        <text
          class="axis-title"
          text-anchor="middle"
          [attr.x]="(margin.left + width - margin.right) / 2"
          [attr.y]="height - 4"
        >
          {{ xTitle() }}
        </text>
        @for (line of drawnLines(); track line.label) {
          <path
            class="line"
            [attr.d]="line.path"
            [attr.stroke]="line.colour"
            [attr.stroke-dasharray]="line.dashes"
          />
          @for (point of line.points; track point.x) {
            <circle
              r="3.5"
              [attr.cx]="point.x"
              [attr.cy]="point.y"
              [attr.fill]="line.colour"
            >
              <title>{{ point.description }}</title>
            </circle>
          }
        }
      </svg>
      <figcaption>
        @for (line of drawnLines(); track line.label) {
          <span class="legend-item">
            <svg width="28" height="10" aria-hidden="true">
              <line
                x1="0"
                x2="28"
                y1="5"
                y2="5"
                stroke-width="2.5"
                [attr.stroke]="line.colour"
                [attr.stroke-dasharray]="line.dashes"
              />
            </svg>
            {{ line.label }}
          </span>
        }
      </figcaption>
    </figure>
  `,
  styles: `
    figure {
      margin: 0;
      max-width: 720px;
    }
    svg {
      width: 100%;
      height: auto;
    }
    .grid {
      stroke: var(--mat-sys-outline-variant);
      stroke-width: 1;
    }
    .tick,
    .axis-title {
      fill: var(--mat-sys-on-surface-variant);
      font-size: 12px;
    }
    .line {
      fill: none;
      stroke-width: 2.5;
      stroke-linejoin: round;
    }
    figcaption {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 20px;
      padding-left: 44px;
      color: var(--mat-sys-on-surface-variant);
    }
    .legend-item {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .legend-item svg {
      width: 28px;
    }
  `,
})
export class LineChart {
  readonly lines = input.required<ChartLine[]>();
  /** The x value of the first value of each line. */
  readonly firstX = input(1);
  readonly xTitle = input('Turn');
  /** What the chart shows, for screen readers. */
  readonly description = input('');

  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly margin = MARGIN;

  private readonly lastX = computed(() => {
    const longestLine = Math.max(
      ...this.lines().map((line) => line.values.length),
    );
    return this.firstX() + Math.max(longestLine - 1, 1);
  });

  protected readonly yTicks = computed<Tick[]>(() =>
    [0, 20, 40, 60, 80, 100].map((percent) => ({
      position: this.yPosition(percent),
      label: `${percent}%`,
    })),
  );

  protected readonly xTicks = computed<Tick[]>(() => {
    const ticks: Tick[] = [];
    for (let x = this.firstX(); x <= this.lastX(); x++)
      ticks.push({ position: this.xPosition(x), label: String(x) });
    return ticks;
  });

  protected readonly drawnLines = computed<DrawnLine[]>(() =>
    this.lines().map((line, lineIndex) => {
      const style = LINE_STYLES[lineIndex % LINE_STYLES.length];
      const points = line.values.map((value, valueIndex) => {
        const x = this.firstX() + valueIndex;
        return {
          x: this.xPosition(x),
          y: this.yPosition(value),
          description: `${line.label}, ${this.xTitle()} ${x}: ${value.toFixed(1)}%`,
        };
      });
      const path = points
        .map(
          (point, index) =>
            `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
        )
        .join(' ');
      return { label: line.label, ...style, path, points };
    }),
  );

  private xPosition(x: number): number {
    const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
    return (
      MARGIN.left +
      ((x - this.firstX()) / (this.lastX() - this.firstX())) * plotWidth
    );
  }

  private yPosition(percent: number): number {
    const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
    return MARGIN.top + (1 - percent / 100) * plotHeight;
  }
}
