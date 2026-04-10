# Optimistic Updates con Shake Rollback

## Goal
Hacer que toda interacción del pipeline editor sea instantánea. El frontend actualiza la UI sin esperar al backend. Si el backend falla, rollback + shake animation en el elemento afectado.

## Patrón

```
1. Usuario hace acción → UI actualiza INMEDIATO (TanStack Query cache update)
2. Request al backend en background
3. Success → no-op (UI ya correcta), invalidate query para sync
4. Error → rollback cache al snapshot + shake animation en elemento afectado
```

## Mutations

### addStep
- `onMutate`: snapshot pipeline cache, agregar step temporal (id: `temp-${Date.now()}`) al array de steps
- `onError`: restore snapshot (nodo desaparece)
- `onSettled`: invalidate pipeline detail (sync real ID del server)

### deleteStep
- `onMutate`: snapshot, remover step del cache, limpiar dependsOn en siblings
- `onError`: restore snapshot, shake en el nodo que reaparece
- `onSettled`: invalidate

### updateStep (side panel save)
- `onMutate`: snapshot, merge data parcial en el step del cache
- `onError`: restore snapshot, shake en el nodo
- `onSettled`: invalidate

### updatePosition (drag)
- Ya es optimista (no invalida query). Sin cambio necesario.

### connectSteps (onConnect)
- `onMutate`: snapshot, agregar sourceId al dependsOn del target step en cache
- `onError`: restore snapshot, shake en target node
- `onSettled`: invalidate

### unlinkSteps
- `onMutate`: snapshot, remover sourceId del dependsOn del target step en cache
- `onError`: restore snapshot, shake en source node
- `onSettled`: invalidate

### runPipeline
- `onMutate`: snapshot, cambiar pipeline.status a "running" en cache
- `onError`: restore snapshot, shake en badge de status
- `onSettled`: invalidate pipeline detail + runs

### completeStep
- `onMutate`: snapshot run cache, marcar step como "completed", siguiente pending→"running"
- `onError`: restore snapshot, shake en el nodo
- `onSettled`: invalidate run detail + pipeline detail

## Shake Animation

### CSS
```css
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-4px); }
  40%, 80% { transform: translateX(4px); }
}
.animate-shake {
  animation: shake 0.3s ease-in-out;
}
```

### Mecanismo
- Estado `shakingNodeIds: Set<string>` en PipelineDetail
- Cuando `onError` se dispara, agrega el node ID al set
- Después de 300ms, lo remueve
- PipelineCanvas pasa `shake` prop al StepNode
- StepNode aplica `animate-shake` className cuando `shake=true`

## Archivos a modificar

### `ui/src/pages/PipelineDetail.tsx`
- Refactorear TODAS las mutations con `onMutate`/`onError`/`onSettled`
- Agregar estado `shakingNodeIds`
- Helper `optimisticMutation()` para reducir boilerplate

### `ui/src/components/pipeline/StepNode.tsx`
- Aceptar `shake?: boolean` en data props
- Aplicar `animate-shake` cuando shake=true

### `ui/src/components/pipeline/PipelineCanvas.tsx`
- Pasar `shakingNodeIds` como prop
- Incluir en node data para StepNode

### `tailwind.config.ts` (o CSS global)
- Agregar keyframe `shake` y clase `animate-shake`
