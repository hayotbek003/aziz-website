import {
  Activity, Armchair, Award, Baby, BadgeCheck, Bed, Bike, Blocks, Briefcase, Brush, Camera, Car, CarFront, Clock,
  Coffee, Cpu, CreditCard, Crown, Diamond, Disc, Drill, Droplet, Dumbbell, Flame, Flower2, Footprints, Fuel, Gamepad2,
  Gauge, Gem, Gift, Glasses, Globe, Hammer, Headphones, Heart, Home, Joystick, Lamp, Laptop, Leaf, Lightbulb, MapPin,
  Monitor, Music, Package, Palette, Percent, Phone, Puzzle, Rabbit, RefreshCw, Rocket, Ruler, Shirt, ShieldCheck,
  ShoppingBag, Smartphone, Snowflake, Sofa, Sparkles, SprayCan, Star, Store, Sun, Tablet, Tag, Timer, ToyBrick, Truck,
  Watch, Wrench, Zap, type LucideIcon, type LucideProps,
} from "lucide-react";

export const ICONS: Record<string, LucideIcon> = {
  Activity, Armchair, Award, Baby, BadgeCheck, Bed, Bike, Blocks, Briefcase, Brush, Camera, Car, CarFront, Clock,
  Coffee, Cpu, CreditCard, Crown, Diamond, Disc, Drill, Droplet, Dumbbell, Flame, Flower2, Footprints, Fuel, Gamepad2,
  Gauge, Gem, Gift, Glasses, Globe, Hammer, Headphones, Heart, Home, Joystick, Lamp, Laptop, Leaf, Lightbulb, MapPin,
  Monitor, Music, Package, Palette, Percent, Phone, Puzzle, Rabbit, RefreshCw, Rocket, Ruler, Shirt, ShieldCheck,
  ShoppingBag, Smartphone, Snowflake, Sofa, Sparkles, SprayCan, Star, Store, Sun, Tablet, Tag, Timer, ToyBrick, Truck,
  Watch, Wrench, Zap,
};

export const ICON_NAMES = Object.keys(ICONS);

export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const C = ICONS[name] || Package;
  return <C {...props} />;
}
