import {
  css,
  CSSResultGroup,
  html,
  nothing,
  PropertyValues,
  TemplateResult,
} from "lit";
import { customElement, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import {
  actionHandler,
  ActionHandlerEvent,
  ClimateEntity,
  computeRTL,
  formatNumber,
  handleAction,
  hasAction,
  HomeAssistant,
  HvacMode,
  isActive,
  isAvailable,
  LovelaceCard,
  LovelaceCardEditor,
} from "../../ha";
import "../../shared/badge-icon";
import "../../shared/card";
import "../../shared/shape-avatar";
import "../../shared/shape-icon";
import "../../shared/state-info";
import "../../shared/state-item";
import { computeAppearance } from "../../utils/appearance";
import { MushroomBaseCard } from "../../utils/base-card";
import { cardStyle } from "../../utils/card-styles";
import { registerCustomCard } from "../../utils/custom-cards";
import { computeEntityPicture } from "../../utils/info";
import { ClimateCardConfig } from "./climate-card-config";
import {
  CLIMATE_CARD_EDITOR_NAME,
  CLIMATE_CARD_NAME,
  CLIMATE_ENTITY_DOMAINS,
} from "./const";
import "./controls/climate-hvac-modes-control";
import { isHvacModesVisible } from "./controls/climate-hvac-modes-control";
import "./controls/climate-temperature-control";
import { isTemperatureControlVisible } from "./controls/climate-temperature-control";
import {
  getHvacActionColor,
  getHvacActionIcon,
  getHvacModeColor,
  getHvacModeIcon,
} from "./utils";

type ClimateCardControl = "temperature_control" | "hvac_mode_control" | "fan_mode_control";

const CONTROLS_ICONS: Record<ClimateCardControl, string> = {
  temperature_control: "mdi:thermometer",
  hvac_mode_control: "mdi:thermostat",
  fan_mode_control: "mdi:fan",
};

registerCustomCard({
  type: CLIMATE_CARD_NAME,
  name: "Modern Climate Card",
  description: "Modern climate card with sleek design",
});

@customElement(CLIMATE_CARD_NAME)
export class ClimateCard
  extends MushroomBaseCard<ClimateCardConfig, ClimateEntity>
  implements LovelaceCard
{
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./climate-card-editor");
    return document.createElement(
      CLIMATE_CARD_EDITOR_NAME
    ) as LovelaceCardEditor;
  }

  public static async getStubConfig(
    hass: HomeAssistant
  ): Promise<ClimateCardConfig> {
    const entities = Object.keys(hass.states);
    const climates = entities.filter((e) =>
      CLIMATE_ENTITY_DOMAINS.includes(e.split(".")[0])
    );
    return {
      type: `custom:${CLIMATE_CARD_NAME}`,
      entity: climates[0],
    };
  }

  @state() private _activeControl?: ClimateCardControl;
  @state() private _outsideTempEntity?: string;
  @state() private _insideTempEntity?: string;
  @state() private _graphEntity?: string;
  @state() private _graphHours: number = 24; // Default to 24 hours
  @state() private _graphData: number[] = [];
  @state() private _graphMin: number = 0;
  @state() private _graphMax: number = 0;

  private get _controls(): ClimateCardControl[] {
    if (!this._config || !this._stateObj) return [];

    const stateObj = this._stateObj;
    const controls: ClimateCardControl[] = [];
    
    if (
      isTemperatureControlVisible(stateObj) &&
      this._config.show_temperature_control !== false
    ) {
      controls.push("temperature_control");
    }
    
    if (isHvacModesVisible(stateObj, this._config.hvac_modes)) {
      controls.push("hvac_mode_control");
    }
    
    if (stateObj.attributes.fan_modes?.length) {
      controls.push("fan_mode_control");
    }
    
    return controls;
  }

  protected get hasControls(): boolean {
    return this._controls.length > 0;
  }

  _onControlTap(ctrl, e): void {
    e.stopPropagation();
    this._activeControl = ctrl;
  }

  setConfig(config: ClimateCardConfig): void {
    super.setConfig({
      tap_action: {
        action: "toggle",
      },
      hold_action: {
        action: "more-info",
      },
      ...config,
    });
    // Check for temperature sensor entities in the config
    this._outsideTempEntity = config.outside_temperature_entity || "";
    this._insideTempEntity = config.inside_temperature_entity || "";
    this._graphEntity = config.graph_entity || "";
    this._graphHours = config.graph_hours || 24; // Default to 24 hours
    
    
    this.updateActiveControl();
  }

  protected updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);
    if (this.hass && changedProperties.has("hass")) {
      this.updateActiveControl();
      this.updateGraphData();
    }
  }
  
  // Helper function to smooth data using a moving average
  private smoothData(data: number[], windowSize: number = 5): number[] {
    if (data.length <= windowSize) return data;
    
    const result: number[] = [];
    
    for (let i = 0; i < data.length; i++) {
      let sum = 0;
      let count = 0;
      
      // Calculate average of surrounding points
      for (let j = Math.max(0, i - Math.floor(windowSize / 2));
           j <= Math.min(data.length - 1, i + Math.floor(windowSize / 2));
           j++) {
        sum += data[j];
        count++;
      }
      
      result.push(sum / count);
    }
    
    return result;
  }
  
  private async updateGraphData() {
    if (!this.hass || !this._graphEntity) return;
    
    // Check if entity exists
    const entity = this.hass.states[this._graphEntity];
    if (!entity) return;
    
    try {
      // Fetch history data for the specified number of hours
      const now = new Date();
      const startTime = new Date();
      startTime.setHours(startTime.getHours() - this._graphHours);
      
      // Use Home Assistant history API
      const history = await this.hass.callApi<any[][]>("GET", `history/period/${startTime.toISOString()}?filter_entity_id=${this._graphEntity}&end_time=${now.toISOString()}&minimal_response`);
      
      if (history && history.length > 0 && history[0].length > 0) {
        // Extract state values and convert to numbers
        const rawData = history[0]
          .map(item => parseFloat(item.state))
          .filter(value => !isNaN(value));
        
        if (rawData.length > 0) {
          // Smooth the data
          const smoothedData = this.smoothData(rawData, 5);
          
          // Reduce the number of points for smoother rendering
          const sampledData = this.sampleData(smoothedData, 20);
          
          // Calculate min and max for scaling
          const min = Math.min(...sampledData);
          const max = Math.max(...sampledData);
          
          this._graphData = sampledData;
          this._graphMin = min;
          this._graphMax = max;
        }
      }
    } catch (error) {
      console.error("Error fetching history data:", error);
    }
  }
  
  // Helper function to sample data to reduce number of points
  private sampleData(data: number[], targetPoints: number): number[] {
    if (data.length <= targetPoints) return data;
    
    const result: number[] = [];
    const step = data.length / targetPoints;
    
    for (let i = 0; i < targetPoints; i++) {
      const index = Math.floor(i * step);
      result.push(data[index]);
    }
    
    // Always include the last point
    if (result.length > 0 && result[result.length - 1] !== data[data.length - 1]) {
      result.push(data[data.length - 1]);
    }
    
    return result;
  }

  updateActiveControl() {
    const isActiveControlSupported = this._activeControl
      ? this._controls.includes(this._activeControl)
      : false;
    this._activeControl = isActiveControlSupported
      ? this._activeControl
      : this._controls[0];
  }

  private _handleAction(ev: ActionHandlerEvent) {
    // Prevent action if the click was on a control
    if ((ev as any).target &&
        ((ev as any).target.closest('.control-buttons') ||
         (ev as any).target.closest('.temperature-controls'))) {
      return;
    }
    
    handleAction(this, this.hass!, this._config!, ev.detail.action!);
  }

  private _getInsideTemperature(): number | null {
    if (this._insideTempEntity && this.hass?.states[this._insideTempEntity]) {
      return parseFloat(this.hass.states[this._insideTempEntity].state);
    }
    
    // Default to climate entity's current temperature
    if (this._stateObj?.attributes.current_temperature) {
      return this._stateObj.attributes.current_temperature;
    }
    
    return null;
  }

  private _getOutsideTemperature(): number | null {
    if (this._outsideTempEntity && this.hass?.states[this._outsideTempEntity]) {
      return parseFloat(this.hass.states[this._outsideTempEntity].state);
    }
    return null;
  }

  protected render() {
    if (!this.hass || !this._config || !this._config.entity) {
      return nothing;
    }
  
    const stateObj = this._stateObj;
  
    if (!stateObj) {
      return this.renderNotFound(this._config);
    }
  
    const name = this._config.name || stateObj.attributes.friendly_name || "";
    const icon = this._config.icon;
    const appearance = computeAppearance(this._config);
    const picture = computeEntityPicture(stateObj, appearance.icon_type);
  
    const insideTemp = this._getInsideTemperature();
    const outsideTemp = this._getOutsideTemperature();
    const targetTemp = stateObj.attributes.temperature;
    
    const rtl = computeRTL(this.hass);
  
    return html`
      <ha-card
        class=${classMap({ "fill-container": appearance.fill_container })}
        @action=${this._handleAction}
        .actionHandler=${actionHandler({
          hasHold: hasAction(this._config.hold_action),
          hasDoubleClick: hasAction(this._config.double_tap_action),
        })}
        tabindex="0"
      >
        <div class="climate-card-container">
          <div class="card-layout">
            <div class="content-wrapper">
              <!-- Left column: Temperature display -->
              <div class="temperature-display">
                ${outsideTemp !== null ? html`
                  <div class="outside-temp">Outside: ${outsideTemp.toFixed(1)}°</div>
                ` : nothing}
                ${insideTemp !== null ? html`
                  <div class="inside-temp">${insideTemp.toFixed(1)}°</div>
                ` : nothing}
                <div class="climate-name">${name}</div>
              </div>
              
              <div class="controls-wrapper">
                <!-- Center column: HVAC and Fan controls -->
                <div class="control-buttons">
                  <div class="hvac-mode-row">
                    ${this.renderHvacModeControls(stateObj)}
                  </div>
                  <div class="fan-mode-row">
                    ${this.renderFanControls(stateObj)}
                  </div>
                </div>
                
                <!-- Right column: Temperature controls -->
                <div class="temperature-controls">
                  ${this.renderTempControls(stateObj)}
                </div>
              </div>
            </div>
          </div>
          
          <div class="climate-card-footer">
            ${this.renderActionBadge(stateObj)}
            ${this._graphEntity && this._graphData.length > 0 ? html`
              <div class="climate-graph">
                <svg viewBox="0 0 500 50" preserveAspectRatio="none" class="temperature-graph">
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stop-color="rgba(255,255,255,0.2)" />
                      <stop offset="100%" stop-color="rgba(255,255,255,0)" />
                    </linearGradient>
                  </defs>
                  <path
                    d="${this.generateGraphPath()}"
                    fill="none"
                    stroke="rgba(255,255,255,0.5)"
                    stroke-width="2"
                    stroke-linejoin="round"
                    stroke-linecap="round"
                  />
                  <path
                    d="${this.generateGraphPath(true)}"
                    fill="url(#gradient)"
                  />
                </svg>
              </div>
            ` : nothing}
          </div>
        </div>
      </ha-card>
    `;
  }

  private renderHvacModeControls(entity: ClimateEntity): TemplateResult | typeof nothing {
    const modes = this._config?.hvac_modes || [];
    const availableModes = entity.attributes.hvac_modes
      .filter(mode => modes.length === 0 || modes.includes(mode));
    
    if (availableModes.length === 0) return nothing;

    return html`
      <div class="hvac-mode-controls">
        ${availableModes.map(mode => this.renderModeButton(mode, entity))}
      </div>
    `;
  }

  private renderModeButton(mode: HvacMode, entity: ClimateEntity): TemplateResult {
    const isActive = mode === entity.state;
    const icon = getHvacModeIcon(mode);
    const color = getHvacModeColor(mode);
    
    return html`
      <button
        class="mode-button ${isActive ? 'active' : ''}"
        @click=${() => this._setHvacMode(mode)}
        style=${isActive ? styleMap({
          "--icon-color": `rgb(${color})`,
          "--button-bg": `rgba(${color}, 0.2)`
        }) : ''}
      >
        <ha-icon .icon=${icon}></ha-icon>
      </button>
    `;
  }

  private _setHvacMode(mode: HvacMode): void {
    this.hass!.callService("climate", "set_hvac_mode", {
      entity_id: this._stateObj!.entity_id,
      hvac_mode: mode
    });
  }

  private renderFanControls(entity: ClimateEntity): TemplateResult | typeof nothing {
    const fanModes = entity.attributes.fan_modes || [];
    
    if (fanModes.length === 0) return nothing;
    
    const currentMode = entity.attributes.fan_mode;

    const FAN_MODE_ICONS: Record<string, string> = {
      "off": "mdi:fan-off",
      "low": "mdi:fan-speed-1",
      "medium": "mdi:fan-speed-2",
      "high": "mdi:fan-speed-3",
      "Level 1": "mdi:numeric-1",
      "Level 2": "mdi:numeric-2",
      "Level 3": "mdi:numeric-3",
      "Level 4": "mdi:numeric-4",
      "Level 5": "mdi:numeric-5",
      "1": "mdi:numeric-1",
      "2": "mdi:numeric-2",
      "3": "mdi:numeric-3",
      "4": "mdi:numeric-4",
      "5": "mdi:numeric-5",
      "auto": "mdi:fan-auto",
      "Auto": "mdi:fan-auto",
      "Silence": "mdi:ear-hearing-off",
      "silence": "mdi:ear-hearing-off",
      "on": "mdi:fan",
    };

      // Custom order: put Auto at the end
      const orderedFanModes = [...fanModes].sort((a, b) => {
        if (a.toLowerCase() === 'auto') return 1;
        if (b.toLowerCase() === 'auto') return -1;
        return 0;
      });
    
      return html`
        <div class="fan-mode-controls">
          ${orderedFanModes.map(mode => html`
            <button
              class="fan-button ${mode === currentMode ? 'active' : ''}"
              @click=${() => this._setFanMode(mode)}
              title=${mode}
            >
              <ha-icon icon="${FAN_MODE_ICONS[mode.toLowerCase()] || 'mdi:fan'}"></ha-icon>
            </button>
          `)}
        </div>
      `;
}

  private _setFanMode(mode: string): void {
    this.hass!.callService("climate", "set_fan_mode", {
      entity_id: this._stateObj!.entity_id,
      fan_mode: mode
    });
  }

  private renderTempControls(entity: ClimateEntity): TemplateResult | typeof nothing {
    if (!isTemperatureControlVisible(entity)) return nothing;
    
    return html`
      <chrum-climate-temperature-control
        .hass=${this.hass}
        .entity=${entity}
        .fill=${true}
      ></chrum-climate-temperature-control>
    `;
  }
  
  private _adjustTemperature(amount: number): void {
    const entity = this._stateObj!;
    const current = entity.attributes.temperature;
    const min = entity.attributes.min_temp || 7;
    const max = entity.attributes.max_temp || 35;
    
    const newTemp = Math.max(min, Math.min(max, current + amount));
    
    this.hass!.callService("climate", "set_temperature", {
      entity_id: entity.entity_id,
      temperature: newTemp
    });
  }

  protected renderActionBadge(entity: ClimateEntity) {
    const hvac_action = entity.attributes.hvac_action;
    if (!hvac_action || hvac_action == "off") return nothing;

    const color = getHvacActionColor(hvac_action);
    const icon = getHvacActionIcon(hvac_action);

    if (!icon) return nothing;

    return html`
      <div class="action-badge">
        <ha-icon
          .icon=${icon}
          style=${styleMap({
            "--icon-color": `rgb(${color})`
          })}
        ></ha-icon>
        <span>${hvac_action}</span>
      </div>
    `;
  }
  
  private generateGraphPath(includeBottom: boolean = false): string {
    if (this._graphData.length === 0) return "";
    
    const width = 500;
    const height = 50;
    const dataPoints = this._graphData.length;
    const range = this._graphMax - this._graphMin || 1; // Avoid division by zero
    
    // Scale data points to fit the SVG viewBox
    const points = this._graphData.map((value, index) => {
      const x = (index / (dataPoints - 1)) * width;
      // Invert Y axis (SVG Y increases downward)
      const y = height - ((value - this._graphMin) / range) * height * 0.8 + height * 0.1;
      return { x, y };
    });
    
    // Create SVG path with smooth curves
    let path = `M${points[0].x},${points[0].y}`;
    
    // Use cubic bezier curves for smooth lines
    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      
      // Calculate control points for smooth curve
      const controlX1 = current.x + (next.x - current.x) / 3;
      const controlY1 = current.y;
      const controlX2 = next.x - (next.x - current.x) / 3;
      const controlY2 = next.y;
      
      path += ` C${controlX1},${controlY1} ${controlX2},${controlY2} ${next.x},${next.y}`;
    }
    
    // If includeBottom is true, add points to create a closed shape for filling
    if (includeBottom) {
      path += ` L${width},${height} L0,${height} Z`;
    }
    
    return path;
  }

  static get styles(): CSSResultGroup {
    return [
      super.styles,
      cardStyle,
      css`
        ha-card {
          color: white;
          padding: 16px;
          overflow: hidden;
          position: relative;
          min-height: 140px; /* Taller card */
          display: flex;
          justify-content: center;
          align-items: center; /* Center vertically */
          box-sizing: border-box;
        }
        
        .climate-card-container {
          display: flex;
          flex-direction: column;
          justify-content: center; /* Center vertically */
          height: 100%;
          width: 100%;
          position: relative;
        }
        
        .card-layout {
          display: flex;
          justify-content: center;
          align-items: center;
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          position: relative;
          z-index: 1; /* Above the footer */
          cursor: pointer; /* Indicate clickable */
        }
        
        .content-wrapper {
          display: flex;
          align-items: center;
          width: 100%;
          overflow: visible;
          box-sizing: border-box;
          position: relative;
        }
        
        .controls-wrapper {
          display: flex;
          align-items: center;
          gap: 0;
          flex: 0 0 auto; /* Don't grow or shrink */
          margin: 0;
          padding: 0;
        }
        
        .temperature-display {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          margin-right: 16px;
          flex: 0 0 auto;
          min-width: 80px; /* Ensure minimum width */
          z-index: 1;
        }
        
        .inside-temp {
          font-size: 2.5em;
          font-weight: 300;
          line-height: 1;
        }
        
        .outside-temp {
          font-size: 0.9em;
          opacity: 0.8;
        }
        
        .climate-name {
          font-size: 0.9em;
          opacity: 0.8;
        }
        
        .control-buttons {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          flex: 0 0 auto; /* Don't grow or shrink */
          position: absolute;
          right: 40px; /* Position from right */
          z-index: 2;
        }
        
        .temperature-controls {
          margin: 0;
          padding: 0;
          position: absolute;
          right: 0;
          z-index: 2;
        }
        
        .hvac-mode-row, .fan-mode-row {
          display: flex;
          justify-content: flex-end;
          margin-right: -4px; /* Negative margin to move buttons to the right */
        }
        
        .temperature-controls-row {
          display: flex;
          justify-content: center;
          margin-top: 16px;
          display: none; /* Hide for now as per the image */
        }
        
        .hvac-mode-controls {
          display: flex;
          flex-wrap: nowrap;
          gap: 0px;
        }
        
        .mode-button {
          background: #444;
          border: none;
          width: 26px;
          height: 26px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: white;
          font-size: 0.8em;
        }
        
        .mode-button ha-icon {
          --mdc-icon-size: 18px;
        }

        .mode-button:first-child {
          border-top-left-radius: 50%;
          border-bottom-left-radius: 50%;
        }
        
        .mode-button.active {
          background: var(--button-bg, rgba(var(--rgb-state-climate-heat), 0.2));
          color: var(--icon-color, rgb(var(--rgb-state-climate-heat)));
        }
        
        .fan-mode-controls {
          display: flex;
          flex-wrap: nowrap;
          gap: 0px;
        }
        
        .fan-button {
          background: #444;
          border: none;
          width: 26px;
          height: 26px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: white;
          font-size: 0.7em;
        }
        
        .fan-button ha-icon {
          --mdc-icon-size: 18px;
        }

        .fan-button:first-child {
          border-top-left-radius: 50%;
          border-bottom-left-radius: 50%;
        }
        
        .fan-button.active {
          background: linear-gradient(180deg, rgba(161, 233, 255, 1) 0%, rgba(196, 236, 255, 1) 100%);
          color: black;
        }
        
        .temperature-column {
          margin-left: 16px;
        }
        
        /* Temperature controls are now handled by the component */
        
        .action-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          margin-top: 8px;
          font-size: 0.8em;
          opacity: 0.8;
        }
        
        .climate-card-footer {
          position: absolute;
          bottom: -16px; /* Extend beyond bottom padding */
          left: -16px; /* Extend beyond padding */
          right: -16px; /* Extend beyond padding */
          height: 66px; /* Taller footer to account for bottom extension */
          z-index: 0; /* Put behind other elements */
        }
        
        .climate-card-footer::before {
          content: "";
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 30px; /* Taller gradient */
          background: linear-gradient(to top, rgba(255,255,255,0.05), transparent);
          border-radius: 0 0 12px 12px;
          width: 100%;
        }

        .climate-graph {
          position: absolute;
          bottom: -16px; /* Extend beyond bottom padding */
          left: 0;
          right: 0;
          height: 66px; /* Taller graph to account for bottom extension */
          overflow: hidden;
          width: calc(100% + 32px); /* Extend beyond padding */
          margin-left: -16px; /* Align with left edge */
        }

        .temperature-graph {
          width: 100%;
          height: 100%;
        }

        /* Icon Spin Animation */
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* Icon Pulse Animation */
        @keyframes pulse {
        0% {
          transform: scale(1);
          opacity: 1;
        }
        50% {
          transform: scale(1.15);
          opacity: 0.8;
        }
        100% {
          transform: scale(1);
          opacity: 1;
        }
      }

      /* Icon Breathe Animation */
      @keyframes breathe {
      0% {
        transform: scale(1);
        box-shadow: 0 0 0px rgba(0, 150, 255, 0.4);
      }
      50% {
        transform: scale(1.05);
        box-shadow: 0 0 10px rgba(0, 150, 255, 0.6);
      }
      100% {
        transform: scale(1);
        box-shadow: 0 0 0px rgba(0, 150, 255, 0.4);
      }
    }

      /* Icon Wiggle Animation */
      @keyframes wiggle {
      0%, 100% {
        transform: rotate(0deg);
      }
      25% {
        transform: rotate(3deg);
      }
      75% {
        transform: rotate(-3deg);
      }
    }

      /* Icon Glow Animation */
      @keyframes glow {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.6;
      }
    }
        
        .fan-button.active ha-icon {
          animation: pulse 2s ease-in-out infinite;
        }
      `
    ];
  }
}