import React, { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";

type Position = {
  left: number;
  width: number;
  opacity: number;
};

type TabProps = {
  children: React.ReactNode;
  setPosition: React.Dispatch<React.SetStateAction<Position>>;
  onClick: () => void;
};

export const SlideTabs = () => {
  const [position, setPosition] = useState<Position>({
    left: 0,
    width: 0,
    opacity: 0,
  });
  const [selected, setSelected] = useState(0);
  const tabsRef = useRef<Array<HTMLLIElement | null>>([]);

  useEffect(() => {
    const selectedTab = tabsRef.current[selected];
    if (selectedTab) {
      const { width } = selectedTab.getBoundingClientRect();
      setPosition({
        left: selectedTab.offsetLeft,
        width,
        opacity: 1,
      });
    }
  }, [selected]);

  return (
    <ul
      onMouseLeave={() => {
        const selectedTab = tabsRef.current[selected];
        if (selectedTab) {
          const { width } = selectedTab.getBoundingClientRect();
          setPosition({
            left: selectedTab.offsetLeft,
            width,
            opacity: 1,
          });
        }
      }}
      className="relative mx-auto flex w-fit rounded-full border-2 border-black bg-white p-1 dark:border-white dark:bg-neutral-800"
    >
      {["Home", "Pricing", "Features", "Docs", "Blog"].map((tab, i) => (
        <Tab
          key={tab}
          ref={(el) => {
            tabsRef.current[i] = el;
          }}
          setPosition={setPosition}
          onClick={() => setSelected(i)}
        >
          {tab}
        </Tab>
      ))}

      <Cursor position={position} />
    </ul>
  );
};

const Tab = React.forwardRef<HTMLLIElement, TabProps>(({ children, setPosition, onClick }, ref) => {
  const setRef = (node: HTMLLIElement | null) => {
    if (typeof ref === "function") {
      ref(node);
    } else if (ref) {
      ref.current = node;
    }
  };

  const getNode = () => {
    if (typeof ref === "function") return null;
    return ref?.current ?? null;
  };

  return (
    <li
      ref={setRef}
      onClick={onClick}
      onMouseEnter={() => {
        const node = getNode();
        if (!node) return;

        const { width } = node.getBoundingClientRect();

        setPosition({
          left: node.offsetLeft,
          width,
          opacity: 1,
        });
      }}
      className="relative z-10 block cursor-pointer px-3 py-1.5 text-xs uppercase text-white mix-blend-difference md:px-5 md:py-3 md:text-base"
    >
      {children}
    </li>
  );
});

Tab.displayName = "Tab";

const Cursor = ({ position }: { position: Position }) => {
  return (
    <motion.li
      animate={{
        ...position,
      }}
      className="absolute z-0 h-7 rounded-full bg-black dark:bg-white md:h-12"
    />
  );
};
