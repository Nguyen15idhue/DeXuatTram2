import { useState, useRef } from 'react';

const DragDropList = ({ items, onReorder, renderItem, onAdd, onRemove }) => {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);

  const handleDragStart = (e, index) => {
    dragItem.current = index;
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dragOverItem.current = index;
    setOverIndex(index);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
      const newItems = [...items];
      const draggedItem = newItems.splice(dragItem.current, 1)[0];
      newItems.splice(dragOverItem.current, 0, draggedItem);
      onReorder(newItems);
    }
    dragItem.current = null;
    dragOverItem.current = null;
    setDragIndex(null);
    setOverIndex(null);
  };

  const handleDragEnd = () => {
    dragItem.current = null;
    dragOverItem.current = null;
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div className="drag-drop-list">
      {onAdd && (
        <div className="drag-drop-add">
          <button type="button" className="btn btn-sm btn-primary" onClick={onAdd}>+ Thêm</button>
        </div>
      )}
      {items.length === 0 ? (
        <div className="drag-drop-empty">Không có mục nào</div>
      ) : (
        <ul className="drag-drop-items">
          {items.map((item, index) => (
            <li
              key={item.id || index}
              className={`drag-drop-item ${dragIndex === index ? 'dragging' : ''} ${overIndex === index ? 'drag-over' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            >
              <span className="drag-handle">⠿</span>
              <div className="drag-drop-content">
                {renderItem ? renderItem(item, index) : <span>{item.label || item.name || item.id}</span>}
              </div>
              {onRemove && (
                <button type="button" className="btn btn-sm btn-delete" onClick={() => onRemove(item, index)}>✕</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default DragDropList;
