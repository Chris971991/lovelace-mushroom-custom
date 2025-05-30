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
    
    this.updateActiveControl();
  }

  protected updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);
    if (this.hass && changedProperties.has("hass")) {
      this.updateActiveControl();
    }
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
      <ha-card class=${classMap({ "fill-container": appearance.fill_container })}>
        <div class="climate-card-container">
          <div class="climate-card-header">
            <div class="temperature-display">
              ${outsideTemp !== null ? html`
                <div class="outside-temp">Outside: ${outsideTemp.toFixed(1)}°</div>
              ` : nothing}
              ${insideTemp !== null ? html`
                <div class="inside-temp">${insideTemp.toFixed(1)}°</div>
              ` : nothing}
              <div class="climate-name">${name}</div>
            </div>
            <div class="climate-controls">
              ${this.renderHvacModeControls(stateObj)}
            </div>
          </div>
          
          <!-- Add explicit temperature control row -->
          <div class="temperature-row">
            ${this.renderTempControls(stateObj)}
          </div>
          
          <div class="climate-card-content">
            ${this.renderFanControls(stateObj)}
          </div>
          
          <div class="climate-card-footer">
            ${this.renderActionBadge(stateObj)}
            ${this._graphEntity ? html`
              <div class="climate-graph">
                <svg viewBox="0 0 500 50" preserveAspectRatio="none" class="temperature-graph">
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stop-color="rgba(255,255,255,0.2)" />
                      <stop offset="100%" stop-color="rgba(255,255,255,0)" />
                    </linearGradient>
                  </defs>
                  <path 
                    d="M0,25 C100,15 200,35 300,25 C400,15 500,30 500,25" 
                    fill="none" 
                    stroke="rgba(255,255,255,0.5)" 
                    stroke-width="2"
                  />
                  <path 
                    d="M0,25 C100,15 200,35 300,25 C400,15 500,30 500,25 L500,50 L0,50 Z" 
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
        }
        
        .climate-card-container {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        
        .climate-card-header {
          display: flex;
          justify-content: space-between;
          padding-bottom: 8px;
        }
        
        .temperature-display {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
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
        
        .climate-card-content {
          display: flex;
          justify-content: space-between;
          margin-top: 8px;
        }
        
        .hvac-mode-controls {
          display: flex;
          flex-wrap: wrap;
          gap: 0px;
        }
        
        .mode-button {
          background: #444;
          border: none;
          border-radius: none;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: white;
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
          flex-wrap: wrap;
          gap: 0px;
        }
        
        .fan-button {
          background: #444;
          border: none;
          border-radius: none;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: white;
          font-size: 0.8em;
        }

        .fan-button:first-child {
          border-top-left-radius: 50%;
          border-bottom-left-radius: 50%;
        }
        
        .fan-button.active {
          background: linear-gradient(180deg, rgba(161, 233, 255, 1) 0%, rgba(196, 236, 255, 1) 100%);
          color: black;
        }
        
        .temp-controls {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        
        .temp-up, .temp-down {
          background: #444;
          border: none;
          width: 40px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: white;
        }
        
        .temp-up {
          border-radius: 16px 16px 0 0;
        }
        
        .temp-down {
          border-radius: 0 0 16px 16px;
        }
        
        .current-temp {
          background: #444;
          width: 40px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1em;
        }
        
        .action-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          margin-top: 8px;
          font-size: 0.8em;
          opacity: 0.8;
        }
        
        .climate-card-footer {
          margin-top: auto;
          position: relative;
          height: 30px;
        }
        
        .climate-card-footer::before {
          content: "";
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 20px;
          background: linear-gradient(to top, rgba(255,255,255,0.05), transparent);
          border-radius: 0 0 12px 12px;
        }

        .climate-graph {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 30px;
          overflow: hidden;
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