import { css, html, LitElement, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import {
  ClimateEntity,
  computeRTL,
  HomeAssistant,
  isAvailable,
  UNIT_F,
} from "../../../ha";

export const isTemperatureControlVisible = (entity: ClimateEntity) =>
  entity.attributes.temperature != null ||
  (entity.attributes.target_temp_low != null &&
    entity.attributes.target_temp_high != null);

@customElement("chrum-climate-temperature-control")
export class ClimateTemperatureControl extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) public entity!: ClimateEntity;
  @property() public fill: boolean = false;

  // Visual states that update immediately
  @state() private _localTemperature?: number;
  @state() private _localLowTemperature?: number;
  @state() private _localHighTemperature?: number;

  protected updated(changedProps: Map<string, unknown>): void {
    if (changedProps.has("entity")) {
      this._localTemperature = this.entity.attributes.temperature;
      this._localLowTemperature = this.entity.attributes.target_temp_low;
      this._localHighTemperature = this.entity.attributes.target_temp_high;
    }
  }

  private get _stepSize(): number {
    if (this.entity.attributes.target_temp_step) {
      return this.entity.attributes.target_temp_step;
    }
    return this.hass!.config.unit_system.temperature === UNIT_F ? 1 : 0.5;
  }

  private _adjustTemperature(amount: number): void {
    if (this.entity.attributes.temperature === undefined) return;
    
    const current = this._localTemperature !== undefined 
      ? this._localTemperature 
      : this.entity.attributes.temperature;
    const min = this.entity.attributes.min_temp || 7;
    const max = this.entity.attributes.max_temp || 35;
    
    // Update local state immediately for responsive UI
    this._localTemperature = Math.max(min, Math.min(max, current + amount));
    
    // Then send to Home Assistant
    this.hass!.callService("climate", "set_temperature", {
      entity_id: this.entity.entity_id,
      temperature: this._localTemperature,
    });
  }

  private _adjustLowTemperature(amount: number): void {
    if (this.entity.attributes.target_temp_low === undefined) return;
    
    const current = this._localLowTemperature !== undefined
      ? this._localLowTemperature
      : this.entity.attributes.target_temp_low;
    const min = this.entity.attributes.min_temp || 7;
    
    const highTemp = this._localHighTemperature !== undefined
      ? this._localHighTemperature
      : (this.entity.attributes.target_temp_high || 35);
      
    const max = Math.min(this.entity.attributes.max_temp || 35, highTemp);
    
    // Update local state immediately for responsive UI
    this._localLowTemperature = Math.max(min, Math.min(max, current + amount));
    
    // Then send to Home Assistant
    this.hass!.callService("climate", "set_temperature", {
      entity_id: this.entity.entity_id,
      target_temp_low: this._localLowTemperature,
      target_temp_high: this.entity.attributes.target_temp_high,
    });
  }

  private _adjustHighTemperature(amount: number): void {
    if (this.entity.attributes.target_temp_high === undefined) return;
    
    const current = this._localHighTemperature !== undefined
      ? this._localHighTemperature
      : this.entity.attributes.target_temp_high;
      
    const lowTemp = this._localLowTemperature !== undefined
      ? this._localLowTemperature
      : (this.entity.attributes.target_temp_low || 7);
      
    const min = Math.max(this.entity.attributes.min_temp || 7, lowTemp);
    const max = this.entity.attributes.max_temp || 35;
    
    // Update local state immediately for responsive UI
    this._localHighTemperature = Math.max(min, Math.min(max, current + amount));
    
    // Then send to Home Assistant
    this.hass!.callService("climate", "set_temperature", {
      entity_id: this.entity.entity_id,
      target_temp_low: this.entity.attributes.target_temp_low,
      target_temp_high: this._localHighTemperature,
    });
  }

  protected render(): TemplateResult {
    const available = isAvailable(this.entity);

    // Single temperature display and control
    if (this.entity.attributes.temperature != null) {
      // Use local temperature for immediate UI updates
      const displayTemp = this._localTemperature !== undefined
        ? this._localTemperature
        : this.entity.attributes.temperature;
      
      return html`
        <div class="temp-controls">
          <button 
            class="temp-up" 
            @click=${() => this._adjustTemperature(this._stepSize)}
            ?disabled=${!available}
          >
            <ha-icon icon="mdi:chevron-up"></ha-icon>
          </button>
          <div class="current-temp">${Math.round(displayTemp)}°</div>
          <button 
            class="temp-down" 
            @click=${() => this._adjustTemperature(-this._stepSize)}
            ?disabled=${!available}
          >
            <ha-icon icon="mdi:chevron-down"></ha-icon>
          </button>
        </div>
      `;
    }
    
    // Dual temperature display and control (heat/cool mode)
    if (this.entity.attributes.target_temp_low != null &&
        this.entity.attributes.target_temp_high != null) {
      // Use local temperatures for immediate UI updates
      const displayLowTemp = this._localLowTemperature !== undefined
        ? this._localLowTemperature
        : this.entity.attributes.target_temp_low;
        
      const displayHighTemp = this._localHighTemperature !== undefined
        ? this._localHighTemperature
        : this.entity.attributes.target_temp_high;
      
      return html`
        <div class="dual-temp-controls">
          <div class="temp-controls heat">
            <button 
              class="temp-up" 
              @click=${() => this._adjustLowTemperature(this._stepSize)}
              ?disabled=${!available}
            >
              <ha-icon icon="mdi:chevron-up"></ha-icon>
            </button>
            <div class="current-temp">${Math.round(displayLowTemp)}°</div>
            <button 
              class="temp-down" 
              @click=${() => this._adjustLowTemperature(-this._stepSize)}
              ?disabled=${!available}
            >
              <ha-icon icon="mdi:chevron-down"></ha-icon>
            </button>
          </div>
          <div class="temp-controls cool">
            <button 
              class="temp-up" 
              @click=${() => this._adjustHighTemperature(this._stepSize)}
              ?disabled=${!available}
            >
              <ha-icon icon="mdi:chevron-up"></ha-icon>
            </button>
            <div class="current-temp">${Math.round(displayHighTemp)}°</div>
            <button 
              class="temp-down" 
              @click=${() => this._adjustHighTemperature(-this._stepSize)}
              ?disabled=${!available}
            >
              <ha-icon icon="mdi:chevron-down"></ha-icon>
            </button>
          </div>
        </div>
      `;
    }
    
    return html`<div>No temperature control available</div>`;
  }

  static get styles() {
    return css`
      :host {
        display: flex;
        justify-content: center;
        padding: 0;
        margin: 0;
      }
      
      .temp-controls {
        display: flex;
        flex-direction: column;
        align-items: center;
        border-radius: 16px;
        padding: 0;
        width: 40px;
      }
      
      .dual-temp-controls {
        display: flex;
        gap: 16px;
      }
      
      .heat {
        --button-bg: rgba(var(--rgb-state-climate-heat), 0.2);
        --text-color: rgb(var(--rgb-state-climate-heat));
      }
      
      .cool {
        --button-bg: rgba(var(--rgb-state-climate-cool), 0.2);
        --text-color: rgb(var(--rgb-state-climate-cool));
      }
      
      .temp-up, .temp-down {
        background: #444;
        border: none;
        width: 40px;
        height: 3rem;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: white;
      }
      
      .temp-up {
        border-radius: 50% 50% 0 0;
      }
      
      .temp-down {
        border-radius: 0 0 50% 50%;
      }
      
      .heat .temp-up, .heat .temp-down, .heat .current-temp {
        background-color: var(--button-bg, #444);
        color: var(--text-color, white);
      }
      
      .cool .temp-up, .cool .temp-down, .cool .current-temp {
        background-color: var(--button-bg, #444);
        color: var(--text-color, white);
      }
      
      .current-temp {
        background: #444;
        width: 40px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2em;
      }
      
      button[disabled] {
        opacity: 0.4;
        cursor: not-allowed;
      }
    `;
  }
}