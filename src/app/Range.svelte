<script lang="ts">
  let {
    label,
    value = $bindable(),
    min,
    max,
    step = 1,
    unit = '',
    disabled = false,
  }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; disabled?: boolean } =
    $props();
</script>

<label class="slider">
  <span class="meta">{label} {value}{unit}</span>
  <input type="range" {min} {max} {step} {disabled} bind:value />
</label>
