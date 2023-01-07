# Names and coordinates of Polish cities and villages

**Features**:
- English names of the fields,
- removed redundant fields.

## Download

See [Releases](https://github.com/mbroton/polish-geodata/releases)

## Structure
The structure of object/row:

| Name     | Type                               | Polish equivalent |
|----------|------------------------------------|-------------------|
| id       | `integer`                           | -                 |
| name     | `string`                           | -                 |
| type     | `string` (`"city"` or `"village"`) | -                 |
| province | `string`                           | województwo       |
| district | `string`                           | powiat            |
| commune  | `string`                           | gmina             |
| lat      | `float`                            | -                 |
| lng      | `float`                            | -                 |

## Source

|             |                                                                    |
|-------------|--------------------------------------------------------------------|
| Format      | XML                                                                |
| License     | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) |
| Valid as of | 01/01/2023                                                         |
| Entries     | 44135                                                              |
|             |                                                                    |

Data comes from Polish government's website (`dane.gov.pl`), specifically from [Państwowy Rejestr Nazw Geograficznych](https://dane.gov.pl/pl/dataset/780,panstwowy-rejestr-nazw-geograficznych-prng/resource/26774/table).

## Parser

Data available here is parsed by `parser.py`.

Usage:

```shell
python3 parser.py [XML source file] [output file] 
```


## License 

<a rel="license" href="http://creativecommons.org/licenses/by/4.0/"><img alt="Creative Commons License" style="border-width:0" src="https://i.creativecommons.org/l/by/4.0/88x31.png" /></a><br />This work is licensed under a <a rel="license" href="http://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0 International License</a>.
