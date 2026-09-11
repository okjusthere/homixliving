"use client";
/* eslint-disable @next/next/no-img-element -- Private authenticated property images. */
import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, GripVertical, X } from "lucide-react";
import { movePhoto } from "@/lib/content/form-state";
export function PhotoSorter({
  ids,
  disabled,
  zh,
  onChange,
}: {
  ids: string[];
  disabled: boolean;
  zh: boolean;
  onChange: (ids: string[]) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null),
    [over, setOver] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  function finish() {
    if (!disabled && dragging && over) onChange(movePhoto(ids, dragging, over));
    setDragging(null);
    setOver(null);
  }
  return (
    <div className="studio-photo-sorter">
      {!!ids.length && (
        <p className="studio-note">
          {zh
            ? "拖动照片调整顺序，第一张作为主图。也可使用左右按钮排序。"
            : "Drag to reorder. The first photo is the hero image. You can also use the arrow buttons."}
        </p>
      )}
      <div
        className="studio-sortable-photos"
        ref={list}
        role="list"
        aria-label={zh ? "房源照片顺序" : "Property photo order"}
      >
        {ids.map((id, index) => (
          <div
            key={id}
            data-photo-id={id}
            role="listitem"
            className={`studio-sortable-photo ${over === id && dragging !== id ? "drop-target" : ""}`}
            draggable={!disabled}
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", id);
              e.dataTransfer.effectAllowed = "move";
              setDragging(id);
              setOver(id);
            }}
            onDragOver={(e) => {
              if (!disabled && dragging) {
                e.preventDefault();
                setOver(id);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (!disabled && dragging) onChange(movePhoto(ids, dragging, id));
              setDragging(null);
              setOver(null);
            }}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
          >
            <img
              draggable={false}
              src={`/api/content/assets/${id}`}
              alt={`${zh ? "房源照片" : "Property photo"} ${index + 1}`}
            />
            <span className="studio-photo-number">
              {index + 1}
              {index === 0 ? (zh ? " · 主图" : " · Hero") : ""}
            </span>
            <button
              type="button"
              className="studio-photo-remove"
              disabled={disabled}
              aria-label={`${zh ? "移除照片" : "Remove photo"} ${index + 1}`}
              onClick={() => onChange(ids.filter((v) => v !== id))}
            >
              <X size={16} />
            </button>
            <div className="studio-photo-controls">
              <button
                type="button"
                disabled={disabled || index === 0}
                aria-label={`${zh ? "向前移动照片" : "Move photo earlier"} ${index + 1}`}
                onClick={() => onChange(movePhoto(ids, id, ids[index - 1]))}
              >
                <ArrowLeft size={15} />
              </button>
              <button
                type="button"
                className="studio-photo-grip"
                disabled={disabled}
                aria-label={`${zh ? "拖动排序照片" : "Drag photo to reorder"} ${index + 1}`}
                draggable={false}
                onPointerDown={(e) => {
                  if (disabled) return;
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDragging(id);
                  setOver(id);
                }}
                onPointerMove={(e) => {
                  if (
                    !dragging ||
                    !e.currentTarget.hasPointerCapture(e.pointerId)
                  )
                    return;
                  const target = document
                    .elementFromPoint(e.clientX, e.clientY)
                    ?.closest<HTMLElement>("[data-photo-id]");
                  if (target && list.current?.contains(target))
                    setOver(target.dataset.photoId || null);
                }}
                onPointerUp={finish}
                onPointerCancel={() => {
                  setDragging(null);
                  setOver(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" && index > 0) {
                    e.preventDefault();
                    onChange(movePhoto(ids, id, ids[index - 1]));
                  }
                  if (e.key === "ArrowRight" && index < ids.length - 1) {
                    e.preventDefault();
                    onChange(movePhoto(ids, id, ids[index + 1]));
                  }
                }}
              >
                <GripVertical size={16} />
              </button>
              <button
                type="button"
                disabled={disabled || index === ids.length - 1}
                aria-label={`${zh ? "向后移动照片" : "Move photo later"} ${index + 1}`}
                onClick={() => onChange(movePhoto(ids, id, ids[index + 1]))}
              >
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <span role="status" className="sr-only">
        {over && dragging
          ? `${zh ? "照片目标位置" : "Photo target position"} ${ids.indexOf(over) + 1}`
          : ""}
      </span>
    </div>
  );
}
