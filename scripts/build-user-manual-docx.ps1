param(
  [string]$Source="docs/user-manual/TapTrack-Superadmin-User-Manual.md",
  [string]$Output="docs/user-manual/TapTrack-Superadmin-User-Manual.docx",
  [string]$PdfOutput=""
)
$ErrorActionPreference="Stop"
$root=Split-Path -Parent $PSScriptRoot
$sourcePath=[IO.Path]::GetFullPath((Join-Path $root $Source));$outputPath=[IO.Path]::GetFullPath((Join-Path $root $Output));$pdfPath=if($PdfOutput){[IO.Path]::GetFullPath((Join-Path $root $PdfOutput))}else{$null};$manualRoot=Split-Path -Parent $sourcePath
if(-not(Test-Path -LiteralPath $sourcePath)){throw "Manual source not found: $sourcePath"}
function Clean([string]$value){$value.Replace("**","").Replace(([char]96).ToString(),"")}
function Paragraph($doc,[string]$text="",[string]$style="Normal"){
  $p=$doc.Paragraphs.Add();$p.Range.Text=$text;$p.Alignment=0;$p.Range.Font.Bold=$false;$p.Range.Font.Italic=$false;$p.Range.Shading.BackgroundPatternColor=-16777216
  try{$p.Range.Style=$style}catch{};$p.Range.InsertParagraphAfter();$p
}
$word=$null;$doc=$null
try{
  $word=New-Object -ComObject Word.Application;$word.Visible=$false;$word.DisplayAlerts=0;$doc=$word.Documents.Add();$section=$doc.Sections.Item(1)
  $section.PageSetup.TopMargin=$word.InchesToPoints(.75);$section.PageSetup.BottomMargin=$word.InchesToPoints(.75);$section.PageSetup.LeftMargin=$word.InchesToPoints(.75);$section.PageSetup.RightMargin=$word.InchesToPoints(.75)
  $green=3890183;$green2=4682248;$muted=6055506
  $normal=$doc.Styles.Item("Normal");$normal.Font.Name="Aptos";$normal.Font.Size=11;$normal.Font.Color=0;$normal.ParagraphFormat.SpaceBefore=0;$normal.ParagraphFormat.SpaceAfter=6;$normal.ParagraphFormat.LineSpacingRule=0
  $h1=$doc.Styles.Item("Heading 1");$h1.Font.Name="Aptos";$h1.Font.Size=15;$h1.Font.Bold=$true;$h1.Font.Color=$green;$h1.ParagraphFormat.SpaceBefore=0;$h1.ParagraphFormat.SpaceAfter=8;$h1.ParagraphFormat.KeepWithNext=$true;$h1.ParagraphFormat.PageBreakBefore=$true
  $h2=$doc.Styles.Item("Heading 2");$h2.Font.Name="Aptos";$h2.Font.Size=12.5;$h2.Font.Bold=$true;$h2.Font.Color=$green2;$h2.ParagraphFormat.SpaceBefore=12;$h2.ParagraphFormat.SpaceAfter=5;$h2.ParagraphFormat.KeepWithNext=$true
  $h3=$doc.Styles.Item("Heading 3");$h3.Font.Name="Aptos";$h3.Font.Size=11;$h3.Font.Bold=$true;$h3.Font.Color=$green2;$h3.ParagraphFormat.SpaceBefore=8;$h3.ParagraphFormat.SpaceAfter=4

  # SATP-style opening: title followed by simple left-aligned metadata.
  $title=Paragraph $doc "TapTrack User Manual";$title.Alignment=1;$title.Range.Font.Name="Georgia";$title.Range.Font.Size=21;$title.Range.Font.Bold=$true;$title.Range.Font.Color=$green;$title.Format.SpaceBefore=12;$title.Format.SpaceAfter=24
  $p=Paragraph $doc "Smart Attendance Management System";$p.Format.SpaceAfter=3
  $p=Paragraph $doc "Notre Dame of Marbel University";$p.Format.SpaceAfter=12
  $p=Paragraph $doc "Version 1.1: September 18, 2026";$p.Format.SpaceAfter=18

  $lines=[IO.File]::ReadAllLines($sourcePath);$i=4;$figure=0;$figureLead=@()
  while($i-lt$lines.Count){
    $line=$lines[$i];if([string]::IsNullOrWhiteSpace($line)){$i++;continue}
    if($line-match'^!\[(.*?)\]\((.*?)\)$'){
      $figure++;$caption=$Matches[1];$image=[IO.Path]::GetFullPath((Join-Path $manualRoot $Matches[2]));if(-not(Test-Path -LiteralPath $image)){throw "Screenshot not found: $image"}
      foreach($lead in $figureLead){$lead.Format.KeepWithNext=$true}
      $p=$doc.Paragraphs.Add();$p.Alignment=1;$p.Range.Shading.BackgroundPatternColor=-16777216;$p.Format.SpaceBefore=8;$p.Format.SpaceAfter=3;$p.Format.KeepWithNext=$true;$shape=$p.Range.InlineShapes.AddPicture($image,$false,$true);$shape.LockAspectRatio=-1
      $maxWidth=$word.InchesToPoints(6.5);$maxHeight=$word.InchesToPoints(4.75);if($shape.Width-gt$maxWidth){$shape.Width=$maxWidth};if($shape.Height-gt$maxHeight){$shape.Height=$maxHeight};$p.Range.InsertParagraphAfter()
      $p=Paragraph $doc "Figure $figure. $caption";$p.Alignment=1;$p.Range.Font.Italic=$true;$p.Range.Font.Size=9;$p.Range.Font.Color=$muted;$p.Format.SpaceBefore=0;$p.Format.SpaceAfter=10;$p.Format.KeepTogether=$true;$figureLead=@();$i++;continue
    }
    if($line-match'^##\s+(.+)$'){$p=Paragraph $doc (Clean $Matches[1]) "Heading 1";$figureLead=@($p);$i++;continue}
    if($line-match'^###\s+(.+)$'){$p=Paragraph $doc (Clean $Matches[1]) "Heading 2";$figureLead=@($p);$i++;continue}
    if($line-match'^####\s+(.+)$'){$p=Paragraph $doc (Clean $Matches[1]) "Heading 3";$figureLead=@($p);$i++;continue}
    if($line-match'^\|.*\|$'-and$i+1-lt$lines.Count-and$lines[$i+1]-match'^\|[\s:|-]+\|$'){
      $headers=@($line.Trim('|').Split('|')|ForEach-Object{$_.Trim()});$rows=New-Object Collections.Generic.List[object];$i+=2
      while($i-lt$lines.Count-and$lines[$i]-match'^\|.*\|$'){$rows.Add(@($lines[$i].Trim('|').Split('|')|ForEach-Object{Clean $_.Trim()}));$i++}
      $range=$doc.Content;$range.Collapse(0);$table=$doc.Tables.Add($range,$rows.Count+1,$headers.Count);$table.Style="Table Grid";$table.Rows.Item(1).Range.Bold=$true;$table.Rows.Item(1).Range.Font.Color=16777215;$table.Rows.Item(1).Shading.BackgroundPatternColor=$green
      for($c=0;$c-lt$headers.Count;$c++){$table.Cell(1,$c+1).Range.Text=Clean $headers[$c]};for($r=0;$r-lt$rows.Count;$r++){for($c=0;$c-lt$headers.Count;$c++){$table.Cell($r+2,$c+1).Range.Text=if($c-lt$rows[$r].Count){$rows[$r][$c]}else{""}}};$table.AutoFitBehavior(2);$doc.Paragraphs.Add()|Out-Null;continue
    }
    if($line-match'^[-*]\s+(.+)$'){$p=Paragraph $doc ([char]0x2022+" "+(Clean $Matches[1]));$p.Format.LeftIndent=$word.InchesToPoints(.25);$p.Format.FirstLineIndent=$word.InchesToPoints(-.15);$p.Format.SpaceAfter=3;if($figureLead.Count){$figureLead+=@($p)};$i++;continue}
    if($line-match'^(\d+)\.\s+(.+)$'){$p=Paragraph $doc ($Matches[1]+". "+(Clean $Matches[2]));$p.Format.LeftIndent=$word.InchesToPoints(.25);$p.Format.FirstLineIndent=$word.InchesToPoints(-.15);$p.Format.SpaceAfter=3;if($figureLead.Count){$figureLead+=@($p)};$i++;continue}
    if($line-match'^>\s*(.+)$'){$p=Paragraph $doc (Clean $Matches[1]);$p.Range.Font.Italic=$true;$p.Range.Font.Color=$muted;$p.Format.LeftIndent=$word.InchesToPoints(.2);$p.Format.RightIndent=$word.InchesToPoints(.2);if($figureLead.Count){$figureLead+=@($p)};$i++;continue}
    $text=Clean $line;$i++;while($i-lt$lines.Count-and-not[string]::IsNullOrWhiteSpace($lines[$i])-and$lines[$i]-notmatch'^(#|!\[|[-*]\s|\d+\.\s|>|\|)'){$text+=" "+(Clean $lines[$i]);$i++}
    $p=Paragraph $doc $text
    if($figureLead.Count){$figureLead+=@($p)}
    $lookAhead=$i;while($lookAhead-lt$lines.Count-and[string]::IsNullOrWhiteSpace($lines[$lookAhead])){$lookAhead++}
    if($lookAhead-lt$lines.Count-and$lines[$lookAhead]-match'^!\['){$p.Format.KeepWithNext=$true}
  }
  $doc.SaveAs2($outputPath,12);Write-Output "Created $outputPath"
  if($pdfPath){$doc.ExportAsFixedFormat($pdfPath,17);Write-Output "Created $pdfPath"}
}finally{if($doc){$doc.Close($false)};if($word){$word.Quit()};if($doc){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($doc)};if($word){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)};[GC]::Collect();[GC]::WaitForPendingFinalizers()}
